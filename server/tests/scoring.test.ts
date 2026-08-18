import { describe, expect, it } from "vitest";
import type { Candidate, Guidance, Role } from "../src/domain/types.js";
import { availabilityPreferenceScore, ScoringService } from "../src/services/scoring.service.js";

const role: Role = {
  roleId: "R004",
  title: "Data Analyst",
  department: "Analytics",
  requiredSkills: ["SQL", "Python/R", "data visualization", "statistics"],
  niceToHaveSkills: ["Tableau", "A/B testing experience"],
  experienceMin: 2,
  experienceMax: 4,
  seniority: "Mid",
  location: "Dubai"
};

const guidance: Guidance = {
  summary: "Default role rubric",
  location: null,
  availability: null,
  priorityTerms: [],
  deprioritizedTerms: [],
  experienceWeightDelta: 0,
  interpretedBy: "local"
};

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    candidateId: "C-TEST",
    headline: "Data analyst",
    skills: ["SQL", "Python", "Tableau", "Statistics", "A/B testing"],
    experienceYears: 3,
    pastRoles: "Data Analyst at a retail company",
    certifications: null,
    education: "B.Sc. Statistics",
    projects: "Built executive dashboards",
    extraCurriculars: null,
    location: "Dubai, UAE",
    normalizedLocation: "dubai, uae",
    noticePeriod: "2 weeks notice",
    noticeDays: 14,
    profileText: "Data analyst SQL Python Tableau Statistics A/B testing Built executive dashboards",
    contentFingerprint: "fingerprint",
    dataQuality: [],
    semanticSimilarity: 0.9,
    ...overrides
  };
}

describe("hybrid candidate scoring", () => {
  it("rewards direct evidence and exposes a transparent score breakdown", () => {
    const result = new ScoringService().score(candidate(), role, guidance);
    expect(result.score).toBeGreaterThan(80);
    expect(result.matchedRequiredSkills).toHaveLength(4);
    expect(Object.values(result.scoreBreakdown).reduce((sum, value) => sum + value, 0)).toBe(result.score);
    expect(result.clarifyingQuestions).toHaveLength(3);
  });

  it("separates match score from evidence confidence", () => {
    const result = new ScoringService().score(
      candidate({
        dataQuality: [
          { code: "invalid_experience", message: "Experience unavailable", severity: "high" },
          { code: "missing_roles", message: "Roles unavailable", severity: "medium" }
        ]
      }),
      role,
      guidance
    );
    expect(result.score).toBeGreaterThan(70);
    expect(result.confidence).toBe(73);
  });

  it("applies explicit recruiter constraints as eligibility gates", () => {
    const result = new ScoringService().score(candidate(), role, {
      ...guidance,
      location: { value: "Riyadh", mode: "required", sourceText: "must be in Riyadh" },
      availability: { value: 7, mode: "required", sourceText: "within 7 days" }
    });
    expect(result.eligible).toBe(false);
  });

  it("uses a gradual availability preference instead of an exact boolean match", () => {
    expect(availabilityPreferenceScore(0, 0)).toBe(100);
    expect(availabilityPreferenceScore(14, 0)).toBe(85);
    expect(availabilityPreferenceScore(30, 0)).toBe(65);
    expect(availabilityPreferenceScore(60, 0)).toBe(30);
    expect(availabilityPreferenceScore(90, 0)).toBe(0);
    expect(availabilityPreferenceScore(null, 0)).toBe(15);
  });

  it("ranks the near-available relevant candidate above a stronger technical match with 90 days notice", () => {
    const preferenceGuidance: Guidance = {
      ...guidance,
      summary: "Require Dubai; prefer immediate availability.",
      location: { value: "Dubai", mode: "required", sourceText: "have to be from Dubai" },
      availability: { value: 0, mode: "preferred", sourceText: "prioritize candidates available immediately" }
    };
    const c117 = new ScoringService().score(candidate({
      candidateId: "C117",
      headline: "Data-driven analyst with e-commerce and retail background",
      experienceYears: null,
      noticeDays: 90,
      noticePeriod: "90 days notice",
      profileText: "Data analyst SQL Python data visualization statistics Tableau A/B testing"
    }), role, preferenceGuidance);
    const c035 = new ScoringService().score(candidate({
      candidateId: "C035",
      headline: "Data analyst with a passion for turning numbers into decisions",
      experienceYears: 7,
      noticeDays: 14,
      noticePeriod: "2 weeks notice",
      profileText: "Data analyst SQL Python statistics"
    }), role, preferenceGuidance);
    const c052 = new ScoringService().score(candidate({
      candidateId: "C052",
      headline: "Creative and data-driven marketing manager",
      experienceYears: 6,
      noticeDays: 0,
      noticePeriod: "Immediate",
      profileText: "Marketing manager Python campaign analytics"
    }), role, preferenceGuidance);

    expect(c035.preferenceScore).toBe(85);
    expect(c117.preferenceScore).toBe(0);
    expect(c035.score).toBeGreaterThan(c117.score);
    expect(c052.qualified).toBe(false);
  });
});
