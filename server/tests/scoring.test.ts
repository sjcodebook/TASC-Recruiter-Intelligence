import { describe, expect, it } from "vitest";
import type { Candidate, Guidance, Role } from "../src/domain/types.js";
import { ScoringService } from "../src/services/scoring.service.js";

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
  maxNoticeDays: null,
  requiredLocation: null,
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
      requiredLocation: "Riyadh",
      maxNoticeDays: 7
    });
    expect(result.eligible).toBe(false);
  });
});
