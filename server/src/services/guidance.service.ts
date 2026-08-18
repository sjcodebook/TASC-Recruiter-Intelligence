import { Service } from "@freshgum/typedi";
import { OpenAIGateway } from "../infrastructure/openai/openai.gateway.js";
import type {
  ExperienceGuidanceCriterion,
  Guidance,
  GuidanceCriterion,
  GuidanceMode,
  GuidanceOverrides,
  LocationGuidanceCriterion,
  TermGuidanceCriterion
} from "../domain/types.js";
import { normalizeText } from "../utils/text.js";
import { TtlCache } from "../utils/ttl-cache.js";

const LOCATIONS = [
  "abu dhabi",
  "dubai",
  "riyadh",
  "cairo",
  "doha",
  "jeddah",
  "sharjah",
  "amman"
];

const SOFT_LANGUAGE = /\b(prefer|preferred|preferably|prioriti[sz]e|ideally|would like|nice[- ]to[- ]have|if possible|bonus|value)\b/i;
const HARD_LANGUAGE = /\b(must|required?|only|have to|has to|need to|needs to|should|shall|within|at most|no more than|or less)\b/i;
const RELAXED_REQUIREMENT = /\b(not required|isn['’]?t required|doesn['’]?t have to|does not have to|don['’]?t have to|do not have to|need not|not necessary|optional)\b/i;
const EXCLUSION_LANGUAGE = /\b(must not|should not|shall not|cannot|can['’]?t|exclude|excluding|except|avoid|without)\b|\bnot\s+(?:be\s+)?(?:in|from|based|have|with)\b/i;

function clauses(rawGuidance: string): string[] {
  const protectedRanges = rawGuidance.replace(
    /between\s+\d+(?:\.\d+)?\s+and\s+\d+(?:\.\d+)?\s+years?/gi,
    (value) => value.replace(/\s+and\s+/i, " __RANGE_AND__ ")
  );
  return protectedRanges
    .split(/\s+(?:and|but)\s+|[,;]/i)
    .map((clause) => clause.replace("__RANGE_AND__", "and").trim())
    .filter(Boolean);
}

function isRelaxed(clause: string): boolean {
  return RELAXED_REQUIREMENT.test(clause);
}

function isExcluded(clause: string): boolean {
  return !isRelaxed(clause) && EXCLUSION_LANGUAGE.test(clause);
}

export function modeForGuidanceClause(clause: string): GuidanceMode {
  if (SOFT_LANGUAGE.test(clause)) return "preferred";
  if (HARD_LANGUAGE.test(clause) || EXCLUSION_LANGUAGE.test(clause)) return "required";
  return "required";
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function locationsIn(clause: string): string[] {
  const normalized = normalizeText(clause);
  return LOCATIONS
    .map((location) => ({ location, index: normalized.indexOf(location) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.location);
}

function durationDays(clause: string): number | null {
  const lower = clause.toLowerCase();
  if (/available immediately|immediate availability|start immediately|join immediately/.test(lower)) return 0;
  if (!/available|availability|notice|start|join|within|at most|no more than|or less/.test(lower)) return null;
  const match = lower.match(/\b(\d+)\s*(day|week|month)s?\b/);
  if (!match) return null;
  const value = Number(match[1]);
  const multiplier = match[2] === "week" ? 7 : match[2] === "month" ? 30 : 1;
  return value * multiplier;
}

function experienceIn(clause: string): ExperienceGuidanceCriterion | null {
  if (isRelaxed(clause) || !/\byears?\b/i.test(clause)) return null;
  const lower = clause.toLowerCase();
  let minYears: number | null = null;
  let maxYears: number | null = null;

  const range = lower.match(/between\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)\s+years?/);
  if (range) {
    minYears = Number(range[1]);
    maxYears = Number(range[2]);
  } else {
    const minimum = lower.match(/(?:at least|minimum(?: of)?|no less than)\s+(\d+(?:\.\d+)?)\s+years?/)
      ?? lower.match(/\b(\d+(?:\.\d+)?)\s*\+\s*years?/);
    const maximum = lower.match(/(?:at most|maximum(?: of)?|no more than)\s+(\d+(?:\.\d+)?)\s+years?/)
      ?? lower.match(/\b(\d+(?:\.\d+)?)\s+years?\s+or less/);
    minYears = minimum ? Number(minimum[1]) : null;
    maxYears = maximum ? Number(maximum[1]) : null;
    if (minYears === null && maxYears === null && /experience|have|with|must|should|required/.test(lower)) {
      const stated = lower.match(/\b(\d+(?:\.\d+)?)\s+years?/);
      if (stated) minYears = Number(stated[1]);
    }
  }

  if (minYears === null && maxYears === null) return null;
  return { minYears, maxYears, mode: modeForGuidanceClause(clause), sourceText: clause };
}

function termKey(value: string): string {
  return normalizeText(value).replace(/\bexperience\b/g, "").trim();
}

function uniqueTerms(terms: TermGuidanceCriterion[]): TermGuidanceCriterion[] {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = termKey(term.value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function removeStructuredTerms(
  terms: TermGuidanceCriterion[],
  location: LocationGuidanceCriterion | null,
  availability: GuidanceCriterion<number> | null,
  experience: ExperienceGuidanceCriterion | null
): TermGuidanceCriterion[] {
  const locationValues = location?.values.map(normalizeText) ?? [];
  return terms.filter((term) => {
    const normalized = normalizeText(term.value);
    if (locationValues.some((locationValue) => normalized.includes(locationValue))) return false;
    if (availability && /\b(availability|available|notice|start|join)\b/.test(normalized)) return false;
    if (experience && /\b(year|years|experience)\b/.test(normalized)) return false;
    return true;
  });
}

function availabilityLabel(days: number): string {
  return days === 0 ? "immediate availability" : `availability within ${days} days`;
}

function locationLabel(location: LocationGuidanceCriterion): string {
  const values = location.values.join(" or ");
  return location.excluded ? `candidates outside ${values}` : `${values}-based candidates`;
}

function experienceLabel(experience: ExperienceGuidanceCriterion): string {
  if (experience.minYears !== null && experience.maxYears !== null) {
    return `${experience.minYears}-${experience.maxYears} years of experience`;
  }
  if (experience.minYears !== null) return `at least ${experience.minYears} years of experience`;
  return `at most ${experience.maxYears} years of experience`;
}

function termLabel(term: TermGuidanceCriterion): string {
  return term.excluded ? `without ${term.value}` : term.value;
}

export function summarizeGuidance(guidance: Omit<Guidance, "interpretedBy" | "summary">): string {
  const required: string[] = [];
  const preferred: string[] = [];
  const add = (mode: GuidanceMode, label: string) => (mode === "required" ? required : preferred).push(label);

  if (guidance.location) add(guidance.location.mode, locationLabel(guidance.location));
  if (guidance.availability) add(guidance.availability.mode, availabilityLabel(guidance.availability.value));
  if (guidance.experience) add(guidance.experience.mode, experienceLabel(guidance.experience));
  for (const term of guidance.terms) add(term.mode, termLabel(term));

  const parts = [
    required.length ? `Require ${required.join(" and ")}` : null,
    preferred.length ? `Prefer ${preferred.join(", ")}` : null,
    guidance.experienceWeightDelta < 0 ? "reduce emphasis on years of experience" : null,
    guidance.experienceWeightDelta > 0 ? "increase emphasis on years of experience" : null
  ].filter((part): part is string => Boolean(part));

  return parts.length ? `${parts.join("; ")}.` : "Default role rubric";
}

function normalizedAiLocation(location: LocationGuidanceCriterion | null): LocationGuidanceCriterion | null {
  if (!location || isRelaxed(location.sourceText)) return null;
  const values = uniqueValues(location.values);
  if (values.length === 0) return null;
  return {
    ...location,
    values,
    mode: modeForGuidanceClause(location.sourceText),
    excluded: location.excluded || isExcluded(location.sourceText)
  };
}

function normalizedAiAvailability(
  availability: GuidanceCriterion<number> | null
): GuidanceCriterion<number> | null {
  if (!availability || isRelaxed(availability.sourceText)) return null;
  return { ...availability, mode: modeForGuidanceClause(availability.sourceText) };
}

function normalizedAiExperience(
  experience: ExperienceGuidanceCriterion | null
): ExperienceGuidanceCriterion | null {
  if (!experience || isRelaxed(experience.sourceText)) return null;
  return { ...experience, mode: modeForGuidanceClause(experience.sourceText) };
}

function normalizedAiTerms(terms: TermGuidanceCriterion[]): TermGuidanceCriterion[] {
  return terms
    .filter((term) => term.value.trim() && !isRelaxed(term.sourceText))
    .map((term) => ({
      ...term,
      value: term.value.trim(),
      mode: modeForGuidanceClause(term.sourceText),
      excluded: term.excluded || isExcluded(term.sourceText)
    }));
}

@Service([OpenAIGateway])
export class GuidanceService {
  private readonly interpretationCache = new TtlCache<Guidance>(50, 30 * 60 * 1000);

  constructor(private readonly openai: OpenAIGateway) {}

  async interpret(rawGuidance: string, overrides: GuidanceOverrides = {}): Promise<Guidance> {
    const trimmed = rawGuidance.trim();
    if (!trimmed) return this.applyOverrides(this.defaultGuidance(), overrides);

    const cached = this.interpretationCache.get(trimmed);
    if (cached) return this.applyOverrides(structuredClone(cached), overrides);

    const local = this.localInterpretation(trimmed);
    const aiResult = await this.openai.interpretGuidance(trimmed);
    const location = local.location ?? normalizedAiLocation(aiResult.location);
    const availability = local.availability ?? normalizedAiAvailability(aiResult.availability);
    const experience = local.experience ?? normalizedAiExperience(aiResult.experience);
    const terms = removeStructuredTerms(
      uniqueTerms([...local.terms, ...normalizedAiTerms(aiResult.terms)]),
      location,
      availability,
      experience
    );
    const merged: Guidance = {
      summary: "",
      location,
      availability,
      terms,
      experience,
      experienceWeightDelta: local.experienceWeightDelta || aiResult.experienceWeightDelta,
      interpretedBy: "hybrid"
    };
    const interpreted = this.withSummary(merged);
    this.interpretationCache.set(trimmed, structuredClone(interpreted));
    return this.applyOverrides(interpreted, overrides);
  }

  localInterpretation(rawGuidance: string): Guidance {
    const guidanceClauses = clauses(rawGuidance);
    let location: LocationGuidanceCriterion | null = null;
    let availability: GuidanceCriterion<number> | null = null;
    let experience: ExperienceGuidanceCriterion | null = null;
    const terms: TermGuidanceCriterion[] = [];

    const termPatterns: Array<[RegExp, string]> = [
      [/client[- ]facing|customer[- ]facing/i, "client-facing"],
      [/arabic/i, "Arabic"],
      [/saas/i, "SaaS"],
      [/leadership|people management/i, "leadership"],
      [/startup/i, "startup experience"]
    ];

    for (const clause of guidanceClauses) {
      if (isRelaxed(clause)) continue;
      const matchedLocations = locationsIn(clause);
      if (matchedLocations.length > 0 && !location) {
        location = {
          values: matchedLocations,
          mode: modeForGuidanceClause(clause),
          excluded: isExcluded(clause),
          sourceText: clause
        };
      }

      const days = durationDays(clause);
      if (days !== null && !availability) {
        availability = { value: days, mode: modeForGuidanceClause(clause), sourceText: clause };
      }

      if (!experience) experience = experienceIn(clause);

      for (const [pattern, value] of termPatterns) {
        if (!pattern.test(clause)) continue;
        terms.push({
          value,
          mode: modeForGuidanceClause(clause),
          excluded: isExcluded(clause),
          sourceText: clause
        });
      }
    }

    const lowerGuidance = rawGuidance.toLowerCase();
    const experienceWeightDelta = /over years|more than years|less emphasis on experience/.test(lowerGuidance)
      ? -5
      : /prioriti[sz]e experience|years of experience matter/.test(lowerGuidance)
        ? 5
        : 0;

    return this.withSummary({
      summary: "",
      location,
      availability,
      terms: uniqueTerms(terms),
      experience,
      experienceWeightDelta,
      interpretedBy: "local"
    });
  }

  private defaultGuidance(): Guidance {
    return {
      summary: "Default role rubric",
      location: null,
      availability: null,
      terms: [],
      experience: null,
      experienceWeightDelta: 0,
      interpretedBy: "local"
    };
  }

  private withSummary(guidance: Guidance): Guidance {
    const { summary: _summary, interpretedBy, ...criteria } = guidance;
    return { ...guidance, summary: summarizeGuidance(criteria), interpretedBy };
  }

  private applyOverrides(guidance: Guidance, overrides: GuidanceOverrides): Guidance {
    const next: Guidance = {
      ...guidance,
      location: guidance.location && overrides.locationMode
        ? { ...guidance.location, mode: overrides.locationMode }
        : guidance.location,
      availability: guidance.availability && overrides.availabilityMode
        ? { ...guidance.availability, mode: overrides.availabilityMode }
        : guidance.availability,
      experience: guidance.experience && overrides.experienceMode
        ? { ...guidance.experience, mode: overrides.experienceMode }
        : guidance.experience,
      terms: guidance.terms.map((term) => ({
        ...term,
        mode: overrides.termModes?.[term.value] ?? term.mode
      }))
    };
    return this.withSummary(next);
  }
}
