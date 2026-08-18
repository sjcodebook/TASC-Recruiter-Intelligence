import { describe, expect, it } from "vitest";
import type { Candidate, Guidance, Role } from "../src/domain/types.js";
import {
  availabilityPreferenceScore,
  effectiveMinimumExperience,
  experiencePreferenceScore,
  roleExperienceFactor,
  ScoringService
} from "../src/services/scoring.service.js";

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
  terms: [],
  experience: null,
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
      location: {
        values: ["Riyadh"],
        mode: "required",
        excluded: false,
        sourceText: "must be in Riyadh"
      },
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

  it("supports required and excluded recruiter evidence", () => {
    const requiredArabic = new ScoringService().score(candidate(), role, {
      ...guidance,
      terms: [{
        value: "Arabic",
        mode: "required",
        excluded: false,
        sourceText: "must have Arabic"
      }]
    });
    expect(requiredArabic.eligible).toBe(false);

    const excludedTableau = new ScoringService().score(candidate(), role, {
      ...guidance,
      terms: [{
        value: "Tableau",
        mode: "required",
        excluded: true,
        sourceText: "must be without Tableau"
      }]
    });
    expect(excludedTableau.eligible).toBe(false);
  });

  it("supports required experience ranges and gradual experience preferences", () => {
    const required = new ScoringService().score(candidate({ experienceYears: 3 }), role, {
      ...guidance,
      experience: {
        minYears: 5,
        maxYears: null,
        mode: "required",
        sourceText: "at least 5 years"
      }
    });
    expect(required.eligible).toBe(false);
    expect(required.eligibleWithoutExperience).toBe(true);
    const exactRaisedMinimum = new ScoringService().score(candidate({ experienceYears: 5 }), role, {
      ...guidance,
      experience: {
        minYears: 5,
        maxYears: null,
        mode: "required",
        sourceText: "at least 5 years"
      }
    });
    expect(exactRaisedMinimum.scoreBreakdown.experience).toBe(10);
    expect(exactRaisedMinimum.qualified).toBe(true);
    expect(experiencePreferenceScore(5, 5, null)).toBe(100);
    expect(experiencePreferenceScore(3, 5, null)).toBe(60);
    expect(experiencePreferenceScore(null, 5, null)).toBe(15);
  });

  it("enforces the role minimum while treating the upper bound as a soft target", () => {
    expect(roleExperienceFactor(3, 4, 7)).toBe(0.5);
    expect(roleExperienceFactor(4, 4, 7)).toBe(1);
    expect(roleExperienceFactor(7, 4, 7)).toBe(1);
    expect(roleExperienceFactor(8, 4, 7)).toBe(0.9);
    expect(roleExperienceFactor(9, 4, 7)).toBe(0.8);
    expect(roleExperienceFactor(null, 4, 7)).toBe(0.5);

    const seniorRole: Role = {
      ...role,
      experienceMin: 4,
      experienceMax: 7,
      seniority: "Senior"
    };
    const belowMinimum = new ScoringService().score(
      candidate({ experienceYears: 3 }),
      seniorRole,
      guidance
    );
    const withinRange = new ScoringService().score(
      candidate({ experienceYears: 5 }),
      seniorRole,
      guidance
    );
    const slightlyAbove = new ScoringService().score(
      candidate({ experienceYears: 8 }),
      seniorRole,
      guidance
    );
    const unknown = new ScoringService().score(
      candidate({ experienceYears: null }),
      seniorRole,
      guidance
    );

    expect(belowMinimum.scoreBreakdown.experience).toBe(5);
    expect(belowMinimum.meetsMinimumExperience).toBe(false);
    expect(belowMinimum.meetsRoleRelevanceThreshold).toBe(true);
    expect(belowMinimum.qualified).toBe(false);
    expect(belowMinimum.gaps).toContain(
      "The reported 3 years of experience is below the 4-year minimum."
    );
    expect(withinRange.scoreBreakdown.experience).toBe(10);
    expect(withinRange.qualified).toBe(true);
    expect(slightlyAbove.scoreBreakdown.experience).toBe(9);
    expect(slightlyAbove.qualified).toBe(true);
    expect(unknown.scoreBreakdown.experience).toBe(5);
    expect(unknown.meetsMinimumExperience).toBeNull();
    expect(unknown.qualified).toBe(true);

    const recruiterOverride: Guidance = {
      ...guidance,
      experience: {
        minYears: 3,
        maxYears: null,
        mode: "required",
        sourceText: "consider candidates with at least 3 years"
      }
    };
    const explicitlyAllowed = new ScoringService().score(
      candidate({ experienceYears: 3 }),
      seniorRole,
      recruiterOverride
    );
    expect(effectiveMinimumExperience(seniorRole, recruiterOverride)).toBe(3);
    expect(explicitlyAllowed.meetsMinimumExperience).toBe(true);
    expect(explicitlyAllowed.qualified).toBe(true);
  });

  it("supports alternative and excluded location constraints", () => {
    const alternatives = new ScoringService().score(candidate(), role, {
      ...guidance,
      location: {
        values: ["Dubai", "Abu Dhabi"],
        mode: "required",
        excluded: false,
        sourceText: "Dubai or Abu Dhabi only"
      }
    });
    expect(alternatives.eligible).toBe(true);

    const excluded = new ScoringService().score(candidate(), role, {
      ...guidance,
      location: {
        values: ["Dubai"],
        mode: "required",
        excluded: true,
        sourceText: "must not be in Dubai"
      }
    });
    expect(excluded.eligible).toBe(false);
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
    expect(ranked.map((profile) => profile.score)).toEqual([85.2, 78.6, 76.3, 75.6, 74.6, 71.6]);
    expect(ranked[0].confidence).toBeLessThan(ranked[1].confidence);
  });

  it("ranks the near-available relevant candidate above a stronger technical match with 90 days notice", () => {
    const preferenceGuidance: Guidance = {
      ...guidance,
      summary: "Require Dubai; prefer immediate availability.",
      location: {
        values: ["Dubai"],
        mode: "required",
        excluded: false,
        sourceText: "have to be from Dubai"
      },
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
