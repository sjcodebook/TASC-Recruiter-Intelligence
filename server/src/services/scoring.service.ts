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

    let experienceFactor = 0.5;
    if (candidate.experienceYears !== null) {
      if (candidate.experienceYears >= role.experienceMin && candidate.experienceYears <= role.experienceMax) {
        experienceFactor = 1;
      } else {
        const distance = candidate.experienceYears < role.experienceMin
          ? role.experienceMin - candidate.experienceYears
          : candidate.experienceYears - role.experienceMax;
        experienceFactor = Math.max(0.2, 1 - distance * 0.2);
      }
    }
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
      const preferredLocation = normalizeText(guidance.location.value);
      const preferredCountry = CITY_COUNTRY[preferredLocation];
      preferenceScores.push(
        candidateLocation.includes(preferredLocation)
          ? 100
          : preferredCountry && candidateLocation.includes(preferredCountry)
            ? 50
            : 0
      );
    }
    if (guidance.availability?.mode === "preferred") {
      preferenceScores.push(availabilityPreferenceScore(candidate.noticeDays, guidance.availability.value));
    }
    for (const term of guidance.priorityTerms) {
      preferenceScores.push(termMatches(term, searchable) ? 100 : 0);
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

    const hardLocationEligible = guidance.location?.mode !== "required"
      || candidateLocation.includes(normalizeText(guidance.location.value));
    const hardAvailabilityEligible = guidance.availability?.mode !== "required"
      || (candidate.noticeDays !== null && candidate.noticeDays <= guidance.availability.value);
    const eligible = hardLocationEligible && hardAvailabilityEligible;
    const qualified = requiredCoverage >= 0.5 && roleFitScore >= 45;

    const confidencePenalty = candidate.dataQuality.reduce(
      (sum, issue) => sum + (issue.severity === "high" ? 18 : issue.severity === "medium" ? 9 : 4),
      0
    ) + (candidate.duplicateIds?.length ? 4 : 0);
    const confidence = Math.max(35, 100 - confidencePenalty);
    const gaps = [
      ...missingRequiredSkills.map((skill) => `${skill} is not evidenced in the supplied profile.`),
      ...(candidate.experienceYears === null ? ["Years of experience could not be verified."] : []),
      ...(!sameCity ? [`Location alignment with ${role.location} should be confirmed.`] : []),
      ...(candidate.noticeDays === null ? ["Availability needs confirmation."] : []),
      ...(!qualified ? ["The profile is below the minimum role-relevance threshold."] : [])
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
      qualified,
      matchedRequiredSkills,
      missingRequiredSkills,
      matchedPreferredSkills,
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
