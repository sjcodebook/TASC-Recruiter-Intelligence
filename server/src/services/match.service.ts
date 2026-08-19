import { createHash, randomUUID } from "node:crypto";
import { Service } from "@freshgum/typedi";
import { CandidateRepository } from "../repositories/candidate.repository.js";
import { MatchRepository } from "../repositories/match.repository.js";
import { RoleRepository } from "../repositories/role.repository.js";
import { OpenAIGateway } from "../infrastructure/openai/openai.gateway.js";
import { GuidanceService } from "./guidance.service.js";
import { effectiveMinimumExperience, ScoringService } from "./scoring.service.js";
import type {
  Guidance,
  GuidanceOverrides,
  MatchResponse,
  RankedCandidate,
  Role
} from "../domain/types.js";
import { AppError } from "../http/app-error.js";
import { env, EMBEDDING_DIMENSIONS } from "../config/env.js";
import { TtlCache } from "../utils/ttl-cache.js";

export type MatchInput = {
  roleId: string;
  guidance: string;
  limit: number;
  guidanceOverrides: GuidanceOverrides;
};

type MatchContext = {
  role: Role;
  dataVersion: string;
  cacheKey: string;
};

type PreparedInput = {
  guidance: Guidance;
  embedding: number[];
};

const MATCH_ENGINE_VERSION = "match-v4-two-phase";

export function matchCacheKey(input: MatchInput, dataVersion: string): string {
  const termModes = Object.fromEntries(
    Object.entries(input.guidanceOverrides.termModes ?? {}).sort(([left], [right]) => left.localeCompare(right))
  );
  return createHash("sha256").update(JSON.stringify({
    engineVersion: MATCH_ENGINE_VERSION,
    model: env.OPENAI_MODEL,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
    dataVersion,
    roleId: input.roleId,
    guidance: input.guidance,
    limit: input.limit,
    guidanceOverrides: {
      locationMode: input.guidanceOverrides.locationMode ?? null,
      availabilityMode: input.guidanceOverrides.availabilityMode ?? null,
      experienceMode: input.guidanceOverrides.experienceMode ?? null,
      termModes
    }
  })).digest("hex");
}

export function selectEligibleShortlist(
  ranked: RankedCandidate[],
  limit: number
): RankedCandidate[] {
  return ranked
    .filter((candidate) => candidate.eligible && candidate.qualified)
    .slice(0, limit)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function appliedConstraints(guidance: Guidance): string[] {
  return [
    guidance.location?.mode === "required"
      ? guidance.location.excluded
        ? `Excluded location: ${guidance.location.values.join(" or ")}`
        : `Location: ${guidance.location.values.join(" or ")}`
      : null,
    guidance.availability?.mode === "required"
      ? guidance.availability.value === 0
        ? "Availability: immediate"
        : `Notice period: ${guidance.availability.value} days or less`
      : null,
    guidance.experience?.mode === "required"
      ? guidance.experience.minYears !== null && guidance.experience.maxYears !== null
        ? `Experience: ${guidance.experience.minYears}-${guidance.experience.maxYears} years`
        : guidance.experience.minYears !== null
          ? `Experience: ${guidance.experience.minYears}+ years`
          : `Experience: ${guidance.experience.maxYears} years or less`
      : null,
    ...guidance.terms
      .filter((term) => term.mode === "required")
      .map((term) => term.excluded ? `Exclude evidence: ${term.value}` : `Required evidence: ${term.value}`)
  ].filter((constraint): constraint is string => constraint !== null);
}

@Service([
  CandidateRepository,
  MatchRepository,
  RoleRepository,
  OpenAIGateway,
  GuidanceService,
  ScoringService
])
export class MatchService {
  private readonly resultCache = new TtlCache<MatchResponse>(50, 30 * 60 * 1000);
  private readonly preparedInputCache = new TtlCache<PreparedInput>(50, 10 * 60 * 1000);
  private readonly rankingInFlight = new Map<string, Promise<MatchResponse>>();
  private readonly preparationInFlight = new Map<string, Promise<PreparedInput>>();

  constructor(
    private readonly candidates: CandidateRepository,
    private readonly matches: MatchRepository,
    private readonly roles: RoleRepository,
    private readonly openai: OpenAIGateway,
    private readonly guidanceService: GuidanceService,
    private readonly scoring: ScoringService
  ) {}

  /** Compatibility path for API consumers that still need one complete response. */
  async run(input: MatchInput): Promise<MatchResponse> {
    const prepared = await this.prepare(input);
    if (prepared.status === "complete") return prepared;
    return this.finalize(prepared.runId);
  }

  /** Warm only the exact guidance interpretation and query embedding used by prepare(). */
  async preflight(input: MatchInput): Promise<void> {
    const context = await this.context(input);
    if (this.resultCache.get(context.cacheKey)) return;
    await this.getPreparedInput(context.cacheKey, input, context.role);
  }

  async prepare(input: MatchInput): Promise<MatchResponse> {
    const startedAt = performance.now();
    const context = await this.context(input);
    const memoryCached = this.resultCache.get(context.cacheKey);
    if (memoryCached) {
      const replay = await this.replay(memoryCached, input.guidance, context.cacheKey);
      this.logTiming("match.ranking_ready", "memory-cache", startedAt);
      return replay;
    }

    const persisted = await this.matches.findCompletedByCacheKey(context.cacheKey);
    if (persisted) {
      this.resultCache.set(context.cacheKey, structuredClone(persisted));
      const replay = await this.replay(persisted, input.guidance, context.cacheKey);
      this.logTiming("match.ranking_ready", "database-cache", startedAt);
      return replay;
    }

    const pending = this.rankingInFlight.get(context.cacheKey);
    if (pending) {
      const replay = await this.replay(await pending, input.guidance, context.cacheKey);
      this.logTiming("match.ranking_ready", "shared", startedAt);
      return replay;
    }

    const computation = this.computeRanking(input, context);
    this.rankingInFlight.set(context.cacheKey, computation);
    try {
      const response = await computation;
      if (response.status === "complete") {
        this.resultCache.set(context.cacheKey, structuredClone(response));
      }
      this.logTiming("match.ranking_ready", "cold", startedAt);
      return response;
    } finally {
      this.rankingInFlight.delete(context.cacheKey);
    }
  }

  async finalize(runId: string): Promise<MatchResponse> {
    const startedAt = performance.now();
    const claim = await this.matches.claimFinalization(runId);
    if (!claim.claimed) {
      const current = (await this.matches.findRun(runId)).response;
      this.logTiming("match.finalize_reused", current.status, startedAt);
      return current;
    }

    const stored = await this.matches.findRun(runId);
    const response = stored.response;
    try {
      let candidates = response.candidates;
      if (candidates.length > 0) {
        const explanationStartedAt = performance.now();
        const explanations = await this.openai.explainCandidates({
          role: response.role,
          guidance: response.guidance,
          candidates
        });
        candidates = candidates.map((candidate) => ({
          ...candidate,
          ...explanations.get(candidate.candidateId)!
        }));
        this.logTiming("match.stage.explanation", "openai", explanationStartedAt);
      }
      const persistenceStartedAt = performance.now();
      await this.matches.completeRun(runId, candidates);
      this.logTiming("match.stage.final_persistence", "postgres", persistenceStartedAt);
      const completed: MatchResponse = {
        ...response,
        status: "complete",
        explanationError: null,
        generatedAt: new Date().toISOString(),
        candidates
      };
      this.resultCache.set(stored.cacheKey, structuredClone(completed));
      this.logTiming("match.completed", "openai", startedAt);
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evidence generation failed.";
      console.error(JSON.stringify({ event: "match.explanation_error", runId, message }));
      await this.matches.failRun(
        runId,
        "The ranking is safe, but the evidence brief did not finish. Retry to continue."
      );
      this.logTiming("match.explanation_failed", "openai", startedAt);
      throw error;
    }
  }

  async getRun(runId: string): Promise<MatchResponse> {
    return (await this.matches.findRun(runId)).response;
  }

  private async context(input: MatchInput): Promise<MatchContext> {
    const [role, dataVersion] = await Promise.all([
      this.roles.findById(input.roleId),
      this.candidates.dataVersion()
    ]);
    if (!role) throw AppError.notFound(`Role ${input.roleId} was not found.`, "ROLE_NOT_FOUND");
    return { role, dataVersion, cacheKey: matchCacheKey(input, dataVersion) };
  }

  private async getPreparedInput(cacheKey: string, input: MatchInput, role: Role): Promise<PreparedInput> {
    const cached = this.preparedInputCache.get(cacheKey);
    if (cached) return structuredClone(cached);
    const pending = this.preparationInFlight.get(cacheKey);
    if (pending) return structuredClone(await pending);

    const preparation = this.computePreparedInput(input, role);
    this.preparationInFlight.set(cacheKey, preparation);
    try {
      const prepared = await preparation;
      this.preparedInputCache.set(cacheKey, structuredClone(prepared));
      return prepared;
    } finally {
      this.preparationInFlight.delete(cacheKey);
    }
  }

  private async computePreparedInput(input: MatchInput, role: Role): Promise<PreparedInput> {
    const guidanceStartedAt = performance.now();
    const guidance = await this.guidanceService.interpret(input.guidance, input.guidanceOverrides);
    this.logTiming("match.stage.guidance", "openai-or-cache", guidanceStartedAt);
    const queryText = [
      role.title,
      role.department,
      ...role.requiredSkills,
      ...role.niceToHaveSkills,
      ...(guidance.location?.values ?? []),
      guidance.availability ? `${guidance.availability.value} days availability` : "",
      ...guidance.terms.map((term) => term.value),
      guidance.experience
        ? `${guidance.experience.minYears ?? ""}-${guidance.experience.maxYears ?? ""} years experience`
        : "",
      input.guidance
    ].join(" | ");
    const embeddingStartedAt = performance.now();
    const [embedding] = await this.openai.embedMany([queryText]);
    this.logTiming("match.stage.embedding", "openai", embeddingStartedAt);
    return { guidance, embedding };
  }

  private async computeRanking(input: MatchInput, context: MatchContext): Promise<MatchResponse> {
    const prepared = await this.getPreparedInput(context.cacheKey, input, context.role);
    const retrievalStartedAt = performance.now();
    const retrieved = await this.candidates.findSemanticMatches(prepared.embedding, 120);
    this.logTiming("match.stage.retrieval", "pgvector", retrievalStartedAt);
    const scoringStartedAt = performance.now();
    const ranked = retrieved
      .map((candidate) => this.scoring.score(candidate, context.role, prepared.guidance))
      .sort((left, right) => {
        if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
        if (left.qualified !== right.qualified) return left.qualified ? -1 : 1;
        if (right.score !== left.score) return right.score - left.score;
        return right.confidence - left.confidence;
      });
    const eligibleCount = ranked.filter((candidate) => candidate.eligible).length;
    const qualifiedCount = ranked.filter((candidate) => candidate.eligible && candidate.qualified).length;
    const belowMinimumExperienceCount = ranked.filter(
      (candidate) => candidate.eligibleWithoutExperience
        && candidate.meetsRoleRelevanceThreshold
        && candidate.meetsMinimumExperience === false
    ).length;
    const minimumExperienceYears = effectiveMinimumExperience(context.role, prepared.guidance);
    const shortlist = selectEligibleShortlist(ranked, input.limit);
    this.logTiming("match.stage.scoring", "deterministic", scoringStartedAt);
    const status = shortlist.length === 0 ? "complete" as const : "ranking_ready" as const;
    const response: MatchResponse = {
      runId: randomUUID(),
      status,
      explanationError: null,
      role: context.role,
      guidance: prepared.guidance,
      candidates: shortlist,
      generatedAt: new Date().toISOString(),
      aiMode: "openai",
      totalConsidered: retrieved.length,
      duplicatesHidden: retrieved.reduce((sum, candidate) => sum + (candidate.duplicateIds?.length ?? 0), 0),
      requestedLimit: input.limit,
      eligibleCount,
      qualifiedCount,
      belowMinimumExperienceCount,
      minimumExperienceYears,
      appliedConstraints: appliedConstraints(prepared.guidance)
    };
    const persistenceStartedAt = performance.now();
    await this.matches.saveRun(response, input.guidance, context.cacheKey);
    this.logTiming("match.stage.ranking_persistence", "postgres", persistenceStartedAt);
    return response;
  }

  private async replay(cached: MatchResponse, rawGuidance: string, cacheKey: string): Promise<MatchResponse> {
    const response = structuredClone(cached);
    response.runId = randomUUID();
    response.generatedAt = new Date().toISOString();
    response.explanationError = null;
    await this.matches.saveRun(response, rawGuidance, cacheKey);
    return response;
  }

  private logTiming(event: string, source: string, startedAt: number): void {
    console.info(JSON.stringify({
      event,
      source,
      durationMs: Math.round(performance.now() - startedAt)
    }));
  }

  approve(runId: string, candidateIds: string[]): Promise<string> {
    return this.matches.approveAndBuildMarkdown(runId, candidateIds);
  }
}
