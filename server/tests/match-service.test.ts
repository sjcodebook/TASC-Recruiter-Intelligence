import { describe, expect, it, vi } from "vitest";
import type { RankedCandidate } from "../src/domain/types.js";
import { MatchService, matchCacheKey, selectEligibleShortlist } from "../src/services/match.service.js";

function rankedCandidate(
  candidateId: string,
  score: number,
  eligible: boolean,
  qualified = true
): RankedCandidate {
  return {
    candidateId,
    headline: candidateId,
    skills: [],
    experienceYears: 3,
    pastRoles: "",
    certifications: null,
    education: null,
    projects: null,
    extraCurriculars: null,
    location: null,
    normalizedLocation: null,
    noticePeriod: null,
    noticeDays: null,
    profileText: "",
    contentFingerprint: candidateId,
    dataQuality: [],
    rank: 0,
    score,
    roleFitScore: score,
    preferenceScore: null,
    confidence: 100,
    fitBand: score >= 75 ? "Strong" : score >= 60 ? "Promising" : "Stretch",
    eligible,
    eligibleWithoutExperience: eligible,
    qualified,
    meetsMinimumExperience: true,
    meetsRoleRelevanceThreshold: qualified,
    matchedRequiredSkills: [],
    missingRequiredSkills: [],
    matchedPreferredSkills: [],
    matchedGuidanceTerms: [],
    scoreBreakdown: {
      requiredSkills: 0,
      evidence: 0,
      experience: 0,
      preferredSkills: 0,
      roleLocation: 0,
      recruiterGuidance: 0
    },
    whyFit: "",
    gaps: [],
    clarifyingQuestions: []
  };
}

describe("hard-constraint shortlisting", () => {
  it("returns fewer than the requested limit instead of filling with ineligible candidates", () => {
    const ranked = [
      rankedCandidate("C001", 90, true),
      rankedCandidate("C002", 88, true),
      rankedCandidate("C003", 99, false)
    ];

    const shortlist = selectEligibleShortlist(ranked, 5);

    expect(shortlist.map((candidate) => candidate.candidateId)).toEqual(["C001", "C002"]);
    expect(shortlist.map((candidate) => candidate.rank)).toEqual([1, 2]);
  });

  it("does not fill the shortlist with profiles below the role-relevance threshold", () => {
    const ranked = [
      rankedCandidate("C001", 82, true),
      rankedCandidate("C002", 78, true, false),
      rankedCandidate("C003", 72, true)
    ];

    const shortlist = selectEligibleShortlist(ranked, 5);

    expect(shortlist.map((candidate) => candidate.candidateId)).toEqual(["C001", "C003"]);
  });
});

describe("exact match result caching", () => {
  it("uses the same key regardless of recruiter term override insertion order", () => {
    const base = {
      roleId: "R001",
      guidance: "Must know SQL and Python",
      limit: 5,
      guidanceOverrides: { termModes: { SQL: "required", Python: "preferred" } }
    } as const;
    const reordered = {
      ...base,
      guidanceOverrides: { termModes: { Python: "preferred", SQL: "required" } }
    } as const;

    expect(matchCacheKey(base, "data-v1")).toBe(matchCacheKey(reordered, "data-v1"));
    expect(matchCacheKey(base, "data-v1")).not.toBe(matchCacheKey(base, "data-v2"));
  });

  it("reuses a completed exact result while creating an independent persisted run", async () => {
    const candidate = rankedCandidate("C001", 82, true);
    const role = {
      roleId: "R001",
      title: "Data Analyst",
      department: "Analytics",
      requiredSkills: [],
      niceToHaveSkills: [],
      experienceMin: 2,
      experienceMax: 4,
      seniority: "Mid",
      location: "Dubai"
    };
    const guidance = {
      summary: "Default role rubric",
      location: null,
      availability: null,
      terms: [],
      experience: null,
      experienceWeightDelta: 0,
      interpretedBy: "local"
    } as const;
    const candidates = {
      dataVersion: vi.fn().mockResolvedValue("data-v1"),
      findSemanticMatches: vi.fn().mockResolvedValue([candidate])
    };
    const matches = { saveRun: vi.fn().mockResolvedValue(undefined) };
    const roles = { findById: vi.fn().mockResolvedValue(role) };
    const openai = {
      embedMany: vi.fn().mockResolvedValue([[0.1, 0.2]]),
      explainCandidates: vi.fn().mockResolvedValue(new Map([
        ["C001", { whyFit: "Evidence-backed fit.", gaps: ["Validate scope."], clarifyingQuestions: ["Q1?", "Q2?", "Q3?"] }]
      ]))
    };
    const guidanceService = { interpret: vi.fn().mockResolvedValue(guidance) };
    const scoring = { score: vi.fn().mockReturnValue(candidate) };
    const service = new MatchService(
      candidates as never,
      matches as never,
      roles as never,
      openai as never,
      guidanceService as never,
      scoring as never
    );
    const input = { roleId: "R001", guidance: "", limit: 5, guidanceOverrides: {} };

    const first = await service.run(input);
    const second = await service.run(input);

    expect(openai.embedMany).toHaveBeenCalledTimes(1);
    expect(openai.explainCandidates).toHaveBeenCalledTimes(1);
    expect(guidanceService.interpret).toHaveBeenCalledTimes(1);
    expect(candidates.findSemanticMatches).toHaveBeenCalledTimes(1);
    expect(matches.saveRun).toHaveBeenCalledTimes(2);
    expect(second.runId).not.toBe(first.runId);
    expect(second.candidates).toEqual(first.candidates);
    expect(matches.saveRun.mock.calls[1][0].rawGuidance).toBe("");
  });
});
