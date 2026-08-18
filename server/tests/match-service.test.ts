import { describe, expect, it } from "vitest";
import type { RankedCandidate } from "../src/domain/types.js";
import { selectEligibleShortlist } from "../src/services/match.service.js";

function rankedCandidate(candidateId: string, score: number, eligible: boolean): RankedCandidate {
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
    confidence: 100,
    fitBand: score >= 75 ? "Strong" : score >= 60 ? "Promising" : "Stretch",
    eligible,
    matchedRequiredSkills: [],
    missingRequiredSkills: [],
    matchedPreferredSkills: [],
    scoreBreakdown: {
      requiredSkills: 0,
      evidence: 0,
      experience: 0,
      preferredSkills: 0,
      logistics: 0,
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
});
