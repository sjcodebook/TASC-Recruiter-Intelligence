import { Service } from "@freshgum/typedi";
import { OpenAIGateway } from "../infrastructure/openai/openai.gateway.js";
import type {
  Guidance,
  GuidanceCriterion,
  GuidanceMode,
  GuidanceOverrides
} from "../domain/types.js";
import { normalizeText } from "../utils/text.js";

const LOCATIONS = ["dubai", "riyadh", "abu dhabi", "cairo", "doha", "jeddah", "sharjah", "amman"];
const HARD_LANGUAGE = /\b(must|required?|only|have to|has to|need to|needs to|within|no more than)\b/i;

function clauses(rawGuidance: string): string[] {
  return rawGuidance
    .split(/\s+(?:and|but)\s+|[,;]/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function modeFor(clause: string): GuidanceMode {
  return HARD_LANGUAGE.test(clause) ? "required" : "preferred";
}

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const normalized = normalizeText(term).replace(/\bexperience\b/g, "").trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function removeStructuredTerms(
  terms: string[],
  location: GuidanceCriterion<string> | null,
  availability: GuidanceCriterion<number> | null
): string[] {
  const locationValue = location?.value.toLowerCase();
  return terms.filter((term) => {
    const normalized = term.toLowerCase();
    if (locationValue && normalized.includes(locationValue)) return false;
    if (availability && /\b(availability|available|notice|start)\b/.test(normalized)) return false;
    return true;
  });
}

function availabilityLabel(days: number): string {
  return days === 0 ? "immediate availability" : `availability within ${days} days`;
}

export function summarizeGuidance(guidance: Omit<Guidance, "interpretedBy" | "summary">): string {
  const required: string[] = [];
  const preferred: string[] = [];
  const add = (mode: GuidanceMode, label: string) => (mode === "required" ? required : preferred).push(label);

  if (guidance.location) add(guidance.location.mode, `${guidance.location.value}-based candidates`);
  if (guidance.availability) add(guidance.availability.mode, availabilityLabel(guidance.availability.value));
  for (const term of guidance.priorityTerms) preferred.push(term);

  const parts = [
    required.length ? `Require ${required.join(" and ")}` : null,
    preferred.length ? `Prefer ${preferred.join(", ")}` : null,
    guidance.experienceWeightDelta < 0 ? "reduce emphasis on years of experience" : null,
    guidance.experienceWeightDelta > 0 ? "increase emphasis on years of experience" : null
  ].filter((part): part is string => Boolean(part));

  return parts.length ? `${parts.join("; ")}.` : "Default role rubric";
}

@Service([OpenAIGateway])
export class GuidanceService {
  constructor(private readonly openai: OpenAIGateway) {}

  async interpret(rawGuidance: string, overrides: GuidanceOverrides = {}): Promise<Guidance> {
    const trimmed = rawGuidance.trim();
    if (!trimmed) return this.applyOverrides(this.defaultGuidance(), overrides);

    const local = this.localInterpretation(trimmed);
    const aiResult = await this.openai.interpretGuidance(trimmed);
    const location = local.location ?? aiResult.location;
    const availability = local.availability ?? aiResult.availability;
    const merged: Guidance = {
      ...aiResult,
      location,
      availability,
      priorityTerms: removeStructuredTerms(
        uniqueTerms([...local.priorityTerms, ...aiResult.priorityTerms]),
        location,
        availability
      ),
      experienceWeightDelta: local.experienceWeightDelta || aiResult.experienceWeightDelta,
      interpretedBy: "openai"
    };
    return this.applyOverrides(this.withSummary(merged), overrides);
  }

  localInterpretation(rawGuidance: string): Guidance {
    const guidanceClauses = clauses(rawGuidance);
    let location: GuidanceCriterion<string> | null = null;
    let availability: GuidanceCriterion<number> | null = null;

    for (const clause of guidanceClauses) {
      const lowerClause = clause.toLowerCase();
      const matchedLocation = LOCATIONS.find((item) => lowerClause.includes(item));
      if (matchedLocation && !location) {
        location = { value: matchedLocation, mode: modeFor(clause), sourceText: clause };
      }

      if (!availability && /available immediately|immediate availability|start immediately/.test(lowerClause)) {
        availability = { value: 0, mode: modeFor(clause), sourceText: clause };
      }
      if (!availability) {
        const withinDays = lowerClause.match(/within\s+(\d+)\s+days?/);
        if (withinDays) {
          availability = { value: Number(withinDays[1]), mode: modeFor(clause), sourceText: clause };
        }
      }
    }

    const lowerGuidance = rawGuidance.toLowerCase();
    const priorityTerms: string[] = [];
    const termPatterns: Array<[RegExp, string]> = [
      [/client[- ]facing|customer[- ]facing/, "client-facing"],
      [/arabic/, "Arabic"],
      [/saas/, "SaaS"],
      [/leadership|people management/, "leadership"],
      [/startup/, "startup experience"]
    ];
    for (const [pattern, term] of termPatterns) if (pattern.test(lowerGuidance)) priorityTerms.push(term);

    const experienceWeightDelta = /over years|more than years|less emphasis on experience/.test(lowerGuidance)
      ? -5
      : /prioriti[sz]e experience|years of experience matter/.test(lowerGuidance)
        ? 5
        : 0;

    return this.withSummary({
      summary: "",
      location,
      availability,
      priorityTerms,
      experienceWeightDelta,
      interpretedBy: "local"
    });
  }

  private defaultGuidance(): Guidance {
    return {
      summary: "Default role rubric",
      location: null,
      availability: null,
      priorityTerms: [],
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
        : guidance.availability
    };
    return this.withSummary(next);
  }
}
