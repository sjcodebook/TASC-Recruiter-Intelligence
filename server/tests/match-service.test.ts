import { describe, expect, it, vi } from "vitest";
import type { MatchResponse, RankedCandidate } from "../src/domain/types.js";
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

function matchResponse(
  status: MatchResponse["status"],
  candidates: RankedCandidate[]
): MatchResponse {
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    status,
    explanationError: null,
    role: {
      roleId: "R001",
      title: "Data Analyst",
      department: "Analytics",
      requiredSkills: [],
      niceToHaveSkills: [],
      experienceMin: 2,
      experienceMax: 4,
      seniority: "Mid",
      location: "Dubai"
    },
    guidance: {
      summary: "Default role rubric",
      location: null,
      availability: null,
      terms: [],
      experience: null,
      experienceWeightDelta: 0,
      interpretedBy: "local"
    },
    candidates,
    generatedAt: "2026-08-19T00:00:00.000Z",
    aiMode: "openai",
    totalConsidered: candidates.length,
    duplicatesHidden: 0,
    requestedLimit: 5,
    eligibleCount: candidates.length,
    qualifiedCount: candidates.length,
    belowMinimumExperienceCount: 0,
    minimumExperienceYears: 2,
    appliedConstraints: []
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
    let persisted: MatchResponse | undefined;
    let persistedCacheKey = "";
    const matches = {
      findCompletedByCacheKey: vi.fn().mockResolvedValue(null),
      saveRun: vi.fn().mockImplementation(async (response: MatchResponse, _guidance: string, cacheKey: string) => {
        persisted = structuredClone(response);
        persistedCacheKey = cacheKey;
      }),
      claimFinalization: vi.fn().mockResolvedValue({ claimed: true, status: "explaining" }),
      findRun: vi.fn().mockImplementation(async () => ({
        response: { ...structuredClone(persisted!), status: "explaining" },
        cacheKey: persistedCacheKey
      })),
      completeRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined)
    };
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
    expect(matches.saveRun.mock.calls[1][1]).toBe("");
    expect(first.status).toBe("complete");
    expect(second.status).toBe("complete");
  });

  it("returns the deterministic ranking before calling the unchanged explanation batch", async () => {
    const firstCandidate = rankedCandidate("C001", 82, true);
    const secondCandidate = rankedCandidate("C002", 78, true);
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
    let persisted: MatchResponse | undefined;
    const matches = {
      findCompletedByCacheKey: vi.fn().mockResolvedValue(null),
      saveRun: vi.fn().mockImplementation(async (response: MatchResponse) => {
        persisted = structuredClone(response);
      }),
      claimFinalization: vi.fn().mockResolvedValue({ claimed: true, status: "explaining" }),
      findRun: vi.fn().mockImplementation(async () => ({
        response: { ...structuredClone(persisted!), status: "explaining" },
        cacheKey: "cache-key"
      })),
      completeRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined)
    };
    const openai = {
      embedMany: vi.fn().mockResolvedValue([[0.1, 0.2]]),
      explainCandidates: vi.fn().mockResolvedValue(new Map([
        ["C001", { whyFit: "First explanation.", gaps: ["First gap."], clarifyingQuestions: ["A?", "B?", "C?"] }],
        ["C002", { whyFit: "Second explanation.", gaps: ["Second gap."], clarifyingQuestions: ["D?", "E?", "F?"] }]
      ]))
    };
    const service = new MatchService(
      {
        dataVersion: vi.fn().mockResolvedValue("data-v1"),
        findSemanticMatches: vi.fn().mockResolvedValue([firstCandidate, secondCandidate])
      } as never,
      matches as never,
      { findById: vi.fn().mockResolvedValue(role) } as never,
      openai as never,
      { interpret: vi.fn().mockResolvedValue(guidance) } as never,
      { score: vi.fn((candidate) => candidate) } as never
    );
    const input = { roleId: "R001", guidance: "", limit: 5, guidanceOverrides: {} };

    const ranking = await service.prepare(input);
    const before = ranking.candidates.map(({ whyFit, gaps, clarifyingQuestions, ...candidate }) => candidate);

    expect(ranking.status).toBe("ranking_ready");
    expect(ranking.candidates.map((candidate) => candidate.candidateId)).toEqual(["C001", "C002"]);
    expect(openai.explainCandidates).not.toHaveBeenCalled();

    const completed = await service.finalize(ranking.runId);
    const after = completed.candidates.map(({ whyFit, gaps, clarifyingQuestions, ...candidate }) => candidate);

    expect(completed.status).toBe("complete");
    expect(after).toEqual(before);
    expect(completed.candidates.map((candidate) => candidate.whyFit)).toEqual([
      "First explanation.",
      "Second explanation."
    ]);
    expect(openai.explainCandidates).toHaveBeenCalledTimes(1);
    expect(matches.completeRun).toHaveBeenCalledTimes(1);
  });
});

describe("two-phase finalization safety", () => {
  it("persists a retryable failure without changing the saved ranking", async () => {
    const response = matchResponse("explaining", [rankedCandidate("C001", 82, true)]);
    const matches = {
      claimFinalization: vi.fn().mockResolvedValue({ claimed: true, status: "explaining" }),
      findRun: vi.fn().mockResolvedValue({ response, cacheKey: "cache-key" }),
      completeRun: vi.fn(),
      failRun: vi.fn().mockResolvedValue(undefined)
    };
    const openai = {
      explainCandidates: vi.fn().mockRejectedValue(new Error("OpenAI timeout"))
    };
    const service = new MatchService(
      {} as never,
      matches as never,
      {} as never,
      openai as never,
      {} as never,
      {} as never
    );

    await expect(service.finalize(response.runId)).rejects.toThrow("OpenAI timeout");

    expect(matches.completeRun).not.toHaveBeenCalled();
    expect(matches.failRun).toHaveBeenCalledWith(
      response.runId,
      "The ranking is safe, but the evidence brief did not finish. Retry to continue."
    );
  });

  it("does not start a duplicate explanation batch while another request owns the run", async () => {
    const response = matchResponse("explaining", [rankedCandidate("C001", 82, true)]);
    const matches = {
      claimFinalization: vi.fn().mockResolvedValue({ claimed: false, status: "explaining" }),
      findRun: vi.fn().mockResolvedValue({ response, cacheKey: "cache-key" })
    };
    const openai = { explainCandidates: vi.fn() };
    const service = new MatchService(
      {} as never,
      matches as never,
      {} as never,
      openai as never,
      {} as never,
      {} as never
    );

    await expect(service.finalize(response.runId)).resolves.toEqual(response);
    expect(openai.explainCandidates).not.toHaveBeenCalled();
  });
});
