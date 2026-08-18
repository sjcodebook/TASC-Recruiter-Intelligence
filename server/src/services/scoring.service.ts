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

@Service([])
export class ScoringService {
  score(candidate: Candidate, role: Role, guidance: Guidance): RankedCandidate {
    const searchable = candidate.profileText;
    const matchedRequiredSkills = role.requiredSkills.filter((skill) => termMatches(skill, searchable));
    const missingRequiredSkills = role.requiredSkills.filter((skill) => !matchedRequiredSkills.includes(skill));
    const matchedPreferredSkills = role.niceToHaveSkills.filter((skill) => termMatches(skill, searchable));

    const requiredSkills = role.requiredSkills.length
      ? 35 * (matchedRequiredSkills.length / role.requiredSkills.length)
      : 35;

    const semantic = Math.max(0, Math.min(1, candidate.semanticSimilarity ?? 0));
    const roleTokens = tokens(`${role.title} ${role.department}`);
    const roleEvidenceTokens = tokens(`${candidate.headline} ${candidate.pastRoles}`);
    const roleOverlap = [...roleTokens].filter((token) => roleEvidenceTokens.has(token)).length;
    const roleEvidence = roleTokens.size ? roleOverlap / roleTokens.size : 0;
    const evidence = 12 * semantic + 8 * Math.min(1, roleEvidence);

    const experienceMax = Math.max(5, Math.min(25, 15 + guidance.experienceWeightDelta));
    const guidanceMax = 25 - experienceMax;
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
    const experience = experienceMax * experienceFactor;
    const preferredSkills = role.niceToHaveSkills.length
      ? 10 * (matchedPreferredSkills.length / role.niceToHaveSkills.length)
      : 10;

    const roleCity = normalizeText(role.location);
    const candidateLocation = normalizeText(candidate.normalizedLocation ?? "");
    const sameCity = candidateLocation.includes(roleCity);
    const country = CITY_COUNTRY[roleCity];
    const sameCountry = Boolean(country && candidateLocation.includes(country));
    const locationPoints = sameCity ? 5 : sameCountry ? 2.5 : 0;
    const availabilityPoints = candidate.noticeDays === null
      ? 2
      : candidate.noticeDays === 0
        ? 5
        : candidate.noticeDays <= 30
          ? 4
          : candidate.noticeDays <= 60
            ? 3
            : 1.5;
    const logistics = locationPoints + availabilityPoints;

    const guidanceSearchable = `${searchable} ${candidate.noticeDays === 0 ? "immediate availability" : ""}`;
    const matchedGuidance = guidance.priorityTerms.filter((term) => termMatches(term, guidanceSearchable));
    const recruiterGuidance = guidance.priorityTerms.length
      ? guidanceMax * (matchedGuidance.length / guidance.priorityTerms.length)
      : guidanceMax;

    const noticeEligible = guidance.maxNoticeDays === null
      || (candidate.noticeDays !== null && candidate.noticeDays <= guidance.maxNoticeDays);
    const locationEligible = !guidance.requiredLocation
      || candidateLocation.includes(normalizeText(guidance.requiredLocation));
    const eligible = noticeEligible && locationEligible;

    const scoreBreakdown: ScoreBreakdown = {
      requiredSkills: round(requiredSkills),
      evidence: round(evidence),
      experience: round(experience),
      preferredSkills: round(preferredSkills),
      logistics: round(logistics),
      recruiterGuidance: round(recruiterGuidance)
    };
    const score = Math.max(
      0,
      Math.min(100, round(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0)))
    );
    const confidencePenalty = candidate.dataQuality.reduce(
      (sum, issue) => sum + (issue.severity === "high" ? 18 : issue.severity === "medium" ? 9 : 4),
      0
    ) + (candidate.duplicateIds?.length ? 4 : 0);
    const confidence = Math.max(35, 100 - confidencePenalty);
    const gaps = [
      ...missingRequiredSkills.map((skill) => `${skill} is not evidenced in the supplied profile.`),
      ...(candidate.experienceYears === null ? ["Years of experience could not be verified."] : []),
      ...(!sameCity ? [`Location alignment with ${role.location} should be confirmed.`] : []),
      ...(candidate.noticeDays === null ? ["Availability needs confirmation."] : [])
    ].slice(0, 4);
    if (gaps.length === 0) gaps.push("Validate the depth and recency of the strongest matched skills.");

    const whyFit = this.buildWhyFit(candidate, role, matchedRequiredSkills, matchedPreferredSkills);
    const clarifyingQuestions = this.buildQuestions(candidate, role, missingRequiredSkills, sameCity);

    return {
      ...candidate,
      rank: 0,
      score,
      confidence,
      fitBand: score >= 75 ? "Strong" : score >= 60 ? "Promising" : "Stretch",
      eligible,
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
    preferred: string[]
  ): string {
    const requiredText = required.length
      ? `The profile shows evidence for ${required.slice(0, 3).join(", ")}`
      : "The supplied profile has limited direct evidence for the listed requirements";
    const experienceText = candidate.experienceYears === null
      ? "experience duration needs verification"
      : `${candidate.experienceYears} years of reported experience is available for review`;
    const preferredText = preferred.length ? ` It also shows ${preferred.slice(0, 2).join(" and ")}.` : "";
    return `${requiredText}, and ${experienceText}, making this a defensible ${role.title} conversation.${preferredText}`;
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
