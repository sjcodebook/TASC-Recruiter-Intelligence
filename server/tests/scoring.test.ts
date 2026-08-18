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

  it("transfers rubric weight between experience and role evidence", () => {
    const profile = candidate({ experienceYears: 10, semanticSimilarity: 0.9 });
    const defaultResult = new ScoringService().score(profile, role, guidance);
    const evidenceFirstResult = new ScoringService().score(profile, role, {
      ...guidance,
      experienceWeightDelta: -5
    });
    const experienceFirstResult = new ScoringService().score(profile, role, {
      ...guidance,
      experienceWeightDelta: 5
    });

    expect(evidenceFirstResult.scoreBreakdown.experience)
      .toBeLessThan(defaultResult.scoreBreakdown.experience);
    expect(evidenceFirstResult.scoreBreakdown.evidence)
      .toBeGreaterThan(defaultResult.scoreBreakdown.evidence);
    expect(experienceFirstResult.scoreBreakdown.experience)
      .toBeGreaterThan(defaultResult.scoreBreakdown.experience);
    expect(experienceFirstResult.scoreBreakdown.evidence)
      .toBeLessThan(defaultResult.scoreBreakdown.evidence);
    expect(
      evidenceFirstResult.scoreBreakdown.experience
      + evidenceFirstResult.scoreBreakdown.evidence
    ).toBeGreaterThan(
      defaultResult.scoreBreakdown.experience
      + defaultResult.scoreBreakdown.evidence
    );
  });

  it("keeps the reported Data Analyst shortlist aligned with role location and evidence", () => {
    const profiles = [
      candidate({
        candidateId: "C117",
        headline: "Data-driven analyst with e-commerce and retail background",
        experienceYears: null,
        pastRoles: "Business Intelligence Analyst in Dubai",
        location: "Dubai, UAE",
        normalizedLocation: "dubai, uae",
        noticeDays: 90,
        profileText: "SQL Python Tableau Statistics A/B testing",
        semanticSimilarity: 0.6755,
        dataQuality: [
          { code: "invalid_experience", message: "Experience could not be parsed", severity: "high" }
        ]
      }),
      candidate({
        candidateId: "C037",
        headline: "Analytics professional with 5 years in SQL and Python",
        experienceYears: 5,
        pastRoles: "Reporting Analyst and Data Analyst in Riyadh",
        location: "Riyadh, Saudi Arabia",
        normalizedLocation: "riyadh, saudi arabia",
        noticeDays: 60,
        profileText: "SQL Python Tableau Statistics A/B testing",
        semanticSimilarity: 0.7
      }),
      candidate({
        candidateId: "C032",
        headline: "Data analyst with a passion for turning numbers into decisions",
        experienceYears: 3,
        pastRoles: "Business Intelligence Analyst in Abu Dhabi",
        location: "Abu Dhabi, UAE",
        normalizedLocation: "abu dhabi, uae",
        noticeDays: 60,
        profileText: "SQL R Power BI Data visualization B.Sc. Statistics",
        semanticSimilarity: 0.6822
      }),
      candidate({
        candidateId: "C040",
        headline: "Data-driven analyst with e-commerce and retail background",
        experienceYears: 2,
        pastRoles: "Data Analyst in Abu Dhabi",
        location: "Abu Dhabi, UAE",
        normalizedLocation: "abu dhabi, uae",
        noticeDays: 90,
        profileText: "SQL R Power BI Data visualization B.Sc. Statistics",
        semanticSimilarity: 0.6422
      }),
      candidate({
        candidateId: "C101",
        headline: "Data-driven analyst with e-commerce and retail background",
        experienceYears: 3,
        pastRoles: "Business Intelligence Analyst and Data Analyst in Cairo",
        location: "Cairo, Egypt",
        normalizedLocation: "cairo, egypt",
        noticeDays: 30,
        profileText: "SQL Python Tableau Statistics A/B testing",
        semanticSimilarity: 0.6422
      }),
      candidate({
        candidateId: "C035",
        headline: "Data analyst with a passion for turning numbers into decisions",
        experienceYears: 7,
        pastRoles: "Business Intelligence Analyst in Dubai",
        location: "Dubai, UAE",
        normalizedLocation: "dubai, uae",
        noticeDays: 14,
        profileText: "SQL Python Statistics",
        semanticSimilarity: 0.6422
      })
    ];

    const ranked = profiles
      .map((profile) => new ScoringService().score(profile, role, guidance))
      .sort((left, right) => right.score - left.score);

    expect(ranked.map((profile) => profile.candidateId)).toEqual([
      "C117",
      "C037",
      "C032",
      "C040",
      "C101",
      "C035"
    ]);
    expect(ranked.map((profile) => profile.score)).toEqual([85.2, 77.6, 76.3, 75.6, 74.6, 68.6]);
    expect(ranked[0].confidence).toBeLessThan(ranked[1].confidence);
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
