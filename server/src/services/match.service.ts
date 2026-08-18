import { createHash, randomUUID } from "node:crypto";
import { Service } from "@freshgum/typedi";
import { CandidateRepository } from "../repositories/candidate.repository.js";
import { MatchRepository } from "../repositories/match.repository.js";
import { RoleRepository } from "../repositories/role.repository.js";
import { OpenAIGateway } from "../infrastructure/openai/openai.gateway.js";
import { GuidanceService } from "./guidance.service.js";
import { effectiveMinimumExperience, ScoringService } from "./scoring.service.js";
import type { GuidanceOverrides, MatchResponse, RankedCandidate, Role } from "../domain/types.js";
import { AppError } from "../http/app-error.js";
import { env, EMBEDDING_DIMENSIONS } from "../config/env.js";
import { TtlCache } from "../utils/ttl-cache.js";

type MatchInput = {
  roleId: string;
  guidance: string;
  limit: number;
  guidanceOverrides: GuidanceOverrides;
};

const MATCH_ENGINE_VERSION = "match-v3";

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
  private readonly inFlight = new Map<string, Promise<MatchResponse>>();

  constructor(
    private readonly candidates: CandidateRepository,
    private readonly matches: MatchRepository,
    private readonly roles: RoleRepository,
    private readonly openai: OpenAIGateway,
    private readonly guidanceService: GuidanceService,
    private readonly scoring: ScoringService
  ) {}

  async run(input: MatchInput): Promise<MatchResponse> {
    const startedAt = performance.now();
    const [role, dataVersion] = await Promise.all([
      this.roles.findById(input.roleId),
      this.candidates.dataVersion()
    ]);
    if (!role) throw AppError.notFound(`Role ${input.roleId} was not found.`, "ROLE_NOT_FOUND");

    const cacheKey = matchCacheKey(input, dataVersion);
    const cached = this.resultCache.get(cacheKey);
    if (cached) {
      const replay = await this.replay(cached, input.guidance);
      this.logTiming("cache", startedAt);
      return replay;
    }

    const pending = this.inFlight.get(cacheKey);
    if (pending) {
      const replay = await this.replay(await pending, input.guidance);
      this.logTiming("shared", startedAt);
      return replay;
    }

    const computation = this.runUncached(input, role);
    this.inFlight.set(cacheKey, computation);
    try {
      const response = await computation;
      this.resultCache.set(cacheKey, structuredClone(response));
      this.logTiming("cold", startedAt);
      return response;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async runUncached(input: MatchInput, role: Role): Promise<MatchResponse> {
    const guidance = await this.guidanceService.interpret(input.guidance, input.guidanceOverrides);
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
    const [embedding] = await this.openai.embedMany([queryText]);
    const retrieved = await this.candidates.findSemanticMatches(embedding, 120);
    const ranked = retrieved
      .map((candidate) => this.scoring.score(candidate, role, guidance))
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
    const minimumExperienceYears = effectiveMinimumExperience(role, guidance);
    let shortlist = selectEligibleShortlist(ranked, input.limit);

    if (shortlist.length > 0) {
      const explanations = await this.openai.explainCandidates({ role, guidance, candidates: shortlist });
      shortlist = shortlist.map((candidate) => ({
        ...candidate,
        ...explanations.get(candidate.candidateId)!
      }));
    }
    const aiMode = "openai" as const;

    const runId = randomUUID();
    await this.matches.saveRun({
      runId,
      roleId: role.roleId,
      rawGuidance: input.guidance,
      guidance,
      aiMode,
      candidates: shortlist
    });

    const appliedConstraints = [
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

    return {
      runId,
      role,
      guidance,
      candidates: shortlist,
      generatedAt: new Date().toISOString(),
      aiMode,
      totalConsidered: retrieved.length,
      duplicatesHidden: retrieved.reduce((sum, candidate) => sum + (candidate.duplicateIds?.length ?? 0), 0),
      requestedLimit: input.limit,
      eligibleCount,
      qualifiedCount,
      belowMinimumExperienceCount,
      minimumExperienceYears,
      appliedConstraints
    };
  }

  private async replay(cached: MatchResponse, rawGuidance: string): Promise<MatchResponse> {
    const response = structuredClone(cached);
    response.runId = randomUUID();
    response.generatedAt = new Date().toISOString();
    await this.matches.saveRun({
      runId: response.runId,
      roleId: response.role.roleId,
      rawGuidance,
      guidance: response.guidance,
      aiMode: response.aiMode,
      candidates: response.candidates
    });
    return response;
  }

  private logTiming(cache: "cold" | "cache" | "shared", startedAt: number): void {
    console.info(JSON.stringify({
      event: "match.completed",
      cache,
      durationMs: Math.round(performance.now() - startedAt)
    }));
  }

  approve(runId: string, candidateIds: string[]): Promise<string> {
    return this.matches.approveAndBuildMarkdown(runId, candidateIds);
  }
}
