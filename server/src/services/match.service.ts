import { randomUUID } from "node:crypto";
import { Service } from "@freshgum/typedi";
import { CandidateRepository } from "../repositories/candidate.repository.js";
import { MatchRepository } from "../repositories/match.repository.js";
import { RoleRepository } from "../repositories/role.repository.js";
import { OpenAIGateway } from "../infrastructure/openai/openai.gateway.js";
import { GuidanceService } from "./guidance.service.js";
import { effectiveMinimumExperience, ScoringService } from "./scoring.service.js";
import type { GuidanceOverrides, MatchResponse, RankedCandidate } from "../domain/types.js";
import { AppError } from "../http/app-error.js";

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
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly matches: MatchRepository,
    private readonly roles: RoleRepository,
    private readonly openai: OpenAIGateway,
    private readonly guidanceService: GuidanceService,
    private readonly scoring: ScoringService
  ) {}

  async run(input: {
    roleId: string;
    guidance: string;
    limit: number;
    guidanceOverrides: GuidanceOverrides;
  }): Promise<MatchResponse> {
    const role = await this.roles.findById(input.roleId);
    if (!role) throw AppError.notFound(`Role ${input.roleId} was not found.`, "ROLE_NOT_FOUND");
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

  approve(runId: string, candidateIds: string[]): Promise<string> {
    return this.matches.approveAndBuildMarkdown(runId, candidateIds);
  }
}
