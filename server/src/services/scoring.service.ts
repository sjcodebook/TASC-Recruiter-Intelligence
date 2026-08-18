import { Service } from "@freshgum/typedi";
import type { Candidate, Guidance, RankedCandidate, Role, ScoreBreakdown } from "../domain/types.js";
import { normalizeText, termMatches, tokens } from "../utils/text.js";

const CITY_COUNTRY: Record<string, string> = {
  dubai: "uae",
  "abu dhabi": "uae",
  riyadh: "saudi arabia",
  cairo: "egypt"
};

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function availabilityPreferenceScore(noticeDays: number | null, targetDays: number): number {
  if (noticeDays === null) return 15;
  if (targetDays === 0) {
    if (noticeDays === 0) return 100;
    if (noticeDays <= 14) return 85;
    if (noticeDays <= 30) return 65;
    if (noticeDays <= 60) return 30;
    return 0;
  }
  if (noticeDays <= targetDays) return 100;
  if (noticeDays <= targetDays + 14) return 70;
  if (noticeDays <= targetDays + 30) return 35;
  return 0;
}

export function experiencePreferenceScore(
  years: number | null,
  minYears: number | null,
  maxYears: number | null
): number {
  if (years === null) return 15;
  const below = minYears === null ? 0 : Math.max(0, minYears - years);
  const above = maxYears === null ? 0 : Math.max(0, years - maxYears);
  return Math.max(0, 100 - (below + above) * 20);
}

export function roleExperienceFactor(
  years: number | null,
  minYears: number,
  maxYears: number
): number {
  if (years === null) return 0.5;
  if (years < minYears) return Math.max(0, 1 - (minYears - years) * 0.5);
  if (years <= maxYears) return 1;
  return Math.max(0.5, 1 - (years - maxYears) * 0.1);
}

function matchesAnyLocation(candidateLocation: string, values: string[]): boolean {
  return values.some((value) => candidateLocation.includes(normalizeText(value)));
}

function sameCountryAsAny(candidateLocation: string, values: string[]): boolean {
  return values.some((value) => {
    const country = CITY_COUNTRY[normalizeText(value)];
    return Boolean(country && candidateLocation.includes(country));
  });
}

export function effectiveMinimumExperience(role: Role, guidance: Guidance): number {
  if (guidance.experience?.mode === "required" && guidance.experience.minYears !== null) {
    return guidance.experience.minYears;
  }
  return role.experienceMin;
}

@Service([])
export class ScoringService {
  score(candidate: Candidate, role: Role, guidance: Guidance): RankedCandidate {
    const searchable = candidate.profileText;
    const matchedRequiredSkills = role.requiredSkills.filter((skill) => termMatches(skill, searchable));
    const missingRequiredSkills = role.requiredSkills.filter((skill) => !matchedRequiredSkills.includes(skill));
    const matchedPreferredSkills = role.niceToHaveSkills.filter((skill) => termMatches(skill, searchable));

    const requiredCoverage = role.requiredSkills.length
      ? matchedRequiredSkills.length / role.requiredSkills.length
      : 1;
    const requiredSkills = 40 * requiredCoverage;

    const semantic = Math.max(0, Math.min(1, candidate.semanticSimilarity ?? 0));
    const roleTokens = tokens(`${role.title} ${role.department}`);
    const roleEvidenceTokens = tokens(`${candidate.headline} ${candidate.pastRoles}`);
    const roleOverlap = [...roleTokens].filter((token) => roleEvidenceTokens.has(token)).length;
    const roleEvidence = roleTokens.size ? roleOverlap / roleTokens.size : 0;
    const experienceWeight = 10 + guidance.experienceWeightDelta;
    const evidenceWeight = 30 - guidance.experienceWeightDelta;
    const evidence = evidenceWeight * (
      0.6 * semantic + 0.4 * Math.min(1, roleEvidence)
    );

    const minimumExperienceYears = effectiveMinimumExperience(role, guidance);
    const maximumExperienceYears = Math.max(role.experienceMax, minimumExperienceYears);
    const experienceFactor = roleExperienceFactor(
      candidate.experienceYears,
      minimumExperienceYears,
      maximumExperienceYears
    );
    const experience = experienceWeight * experienceFactor;
    const preferredSkills = role.niceToHaveSkills.length
      ? 5 * (matchedPreferredSkills.length / role.niceToHaveSkills.length)
      : 5;

    const roleCity = normalizeText(role.location);
    const candidateLocation = normalizeText(candidate.normalizedLocation ?? "");
    const sameCity = candidateLocation.includes(roleCity);
    const country = CITY_COUNTRY[roleCity];
    const sameCountry = Boolean(country && candidateLocation.includes(country));
    const roleLocation = sameCity ? 15 : sameCountry ? 6 : 0;

    const baseBreakdown = {
      requiredSkills: round(requiredSkills),
      evidence: round(evidence),
      experience: round(experience),
      preferredSkills: round(preferredSkills),
      roleLocation: round(roleLocation)
    };
    const roleFitScore = round(Object.values(baseBreakdown).reduce((sum, value) => sum + value, 0));

    const preferenceScores: number[] = [];
    if (guidance.location?.mode === "preferred") {
      const locationMatch = matchesAnyLocation(candidateLocation, guidance.location.values);
      preferenceScores.push(
        guidance.location.excluded
          ? locationMatch ? 0 : 100
          : locationMatch ? 100 : sameCountryAsAny(candidateLocation, guidance.location.values) ? 50 : 0
      );
    }
    if (guidance.availability?.mode === "preferred") {
      preferenceScores.push(availabilityPreferenceScore(candidate.noticeDays, guidance.availability.value));
    }
    for (const term of guidance.terms.filter((criterion) => criterion.mode === "preferred")) {
      const matched = termMatches(term.value, searchable);
      preferenceScores.push(term.excluded ? matched ? 0 : 100 : matched ? 100 : 0);
    }
    if (guidance.experience?.mode === "preferred") {
      preferenceScores.push(experiencePreferenceScore(
        candidate.experienceYears,
        guidance.experience.minYears,
        guidance.experience.maxYears
      ));
    }
    const preferenceScore = preferenceScores.length
      ? round(preferenceScores.reduce((sum, value) => sum + value, 0) / preferenceScores.length)
      : null;

    const roleWeight = preferenceScore === null ? 1 : 0.7;
    const preferenceWeight = preferenceScore === null ? 0 : 0.3;
    const scoreBreakdown: ScoreBreakdown = {
      requiredSkills: round(baseBreakdown.requiredSkills * roleWeight),
      evidence: round(baseBreakdown.evidence * roleWeight),
      experience: round(baseBreakdown.experience * roleWeight),
      preferredSkills: round(baseBreakdown.preferredSkills * roleWeight),
      roleLocation: round(baseBreakdown.roleLocation * roleWeight),
      recruiterGuidance: round((preferenceScore ?? 0) * preferenceWeight)
    };
    const score = Math.max(
      0,
      Math.min(100, round(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0)))
    );

    const locationGuidanceMatch = guidance.location
      ? matchesAnyLocation(candidateLocation, guidance.location.values)
      : false;
    const hardLocationEligible = guidance.location?.mode !== "required"
      || (guidance.location.excluded ? !locationGuidanceMatch : locationGuidanceMatch);
    const hardAvailabilityEligible = guidance.availability?.mode !== "required"
      || (candidate.noticeDays !== null && candidate.noticeDays <= guidance.availability.value);
    const hardTermsEligible = guidance.terms
      .filter((criterion) => criterion.mode === "required")
      .every((criterion) => {
        const matched = termMatches(criterion.value, searchable);
        return criterion.excluded ? !matched : matched;
      });
    const hardExperienceEligible = guidance.experience?.mode !== "required"
      || (candidate.experienceYears !== null
        && (guidance.experience.minYears === null || candidate.experienceYears >= guidance.experience.minYears)
        && (guidance.experience.maxYears === null || candidate.experienceYears <= guidance.experience.maxYears));
    const eligibleWithoutExperience = hardLocationEligible
      && hardAvailabilityEligible
      && hardTermsEligible;
    const eligible = eligibleWithoutExperience && hardExperienceEligible;
    const matchedGuidanceTerms = guidance.terms
      .filter((criterion) => {
        const matched = termMatches(criterion.value, searchable);
        return criterion.excluded ? !matched : matched;
      })
      .map((criterion) => criterion.excluded ? `Without ${criterion.value}` : criterion.value);
    const meetsMinimumExperience = candidate.experienceYears === null
      ? null
      : candidate.experienceYears >= minimumExperienceYears;
    const meetsRoleRelevanceThreshold = requiredCoverage >= 0.5 && roleFitScore >= 45;
    const qualified = meetsRoleRelevanceThreshold && meetsMinimumExperience !== false;

    const confidencePenalty = candidate.dataQuality.reduce(
      (sum, issue) => sum + (issue.severity === "high" ? 18 : issue.severity === "medium" ? 9 : 4),
      0
    ) + (candidate.duplicateIds?.length ? 4 : 0);
    const confidence = Math.max(35, 100 - confidencePenalty);
    const gaps = [
      ...missingRequiredSkills.map((skill) => `${skill} is not evidenced in the supplied profile.`),
      ...(candidate.experienceYears === null ? ["Years of experience could not be verified."] : []),
      ...(meetsMinimumExperience === false
        ? [`The reported ${candidate.experienceYears} years of experience is below the ${minimumExperienceYears}-year minimum.`]
        : []),
      ...(candidate.experienceYears !== null && candidate.experienceYears > maximumExperienceYears
        ? [`The reported ${candidate.experienceYears} years of experience is above the ${maximumExperienceYears}-year target maximum; confirm level and expectations.`]
        : []),
      ...(!sameCity ? [`Location alignment with ${role.location} should be confirmed.`] : []),
      ...(candidate.noticeDays === null ? ["Availability needs confirmation."] : []),
      ...(!meetsRoleRelevanceThreshold ? ["The profile is below the minimum role-relevance threshold."] : [])
    ].slice(0, 4);
    if (gaps.length === 0) gaps.push("Validate the depth and recency of the strongest matched skills.");

    const whyFit = this.buildWhyFit(
      candidate,
      role,
      matchedRequiredSkills,
      matchedPreferredSkills,
      roleFitScore,
      preferenceScore
    );
    const clarifyingQuestions = this.buildQuestions(candidate, role, missingRequiredSkills, sameCity);

    return {
      ...candidate,
      rank: 0,
      score,
      roleFitScore,
      preferenceScore,
      confidence,
      fitBand: score >= 75 ? "Strong" : score >= 60 ? "Promising" : "Stretch",
      eligible,
      eligibleWithoutExperience,
      qualified,
      meetsMinimumExperience,
      meetsRoleRelevanceThreshold,
      matchedRequiredSkills,
      missingRequiredSkills,
      matchedPreferredSkills,
      matchedGuidanceTerms,
      scoreBreakdown,
      whyFit,
      gaps,
      clarifyingQuestions
    };
  }

  private buildWhyFit(
    candidate: Candidate,
    role: Role,
    required: string[],
    preferred: string[],
    roleFitScore: number,
    preferenceScore: number | null
  ): string {
    const requiredText = required.length
      ? `The profile shows evidence for ${required.slice(0, 3).join(", ")}`
      : "The supplied profile has limited direct evidence for the listed requirements";
    const experienceText = candidate.experienceYears === null
      ? "experience duration needs verification"
      : `${candidate.experienceYears} years of reported experience is available for review`;
    const preferredText = preferred.length ? ` It also shows ${preferred.slice(0, 2).join(" and ")}.` : "";
    const priorityText = preferenceScore === null
      ? ""
      : ` Recruiter-priority alignment is ${preferenceScore.toFixed(1)}/100, alongside a ${roleFitScore.toFixed(1)}/100 technical role fit.`;
    return `${requiredText}, and ${experienceText}, making this a defensible ${role.title} conversation.${preferredText}${priorityText}`;
  }

  private buildQuestions(candidate: Candidate, role: Role, missing: string[], sameCity: boolean): string[] {
    const questions = missing.slice(0, 2).map(
      (skill) => `Can you describe a recent example that demonstrates ${skill} at the level this ${role.title} role requires?`
    );
    if (!sameCity) questions.push(`What is your availability to work in ${role.location}, including relocation or travel expectations?`);
    if (candidate.noticeDays === null) questions.push("What is your confirmed notice period and earliest realistic start date?");
    questions.push(`Which accomplishment best demonstrates your readiness for the scope and seniority of this ${role.title} role?`);
    questions.push(`What measurable outcome from your recent work best demonstrates the impact you would bring to this ${role.title} role?`);
    questions.push(`Which part of this ${role.title} role would require the most ramp-up, and how would you close that gap?`);
    return [...new Set(questions)].slice(0, 3);
  }
}
