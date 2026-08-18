import { Service } from "@freshgum/typedi";
import { OpenAIGateway } from "../infrastructure/openai/openai.gateway.js";
import type { Guidance } from "../domain/types.js";

@Service([OpenAIGateway])
export class GuidanceService {
  constructor(private readonly openai: OpenAIGateway) {}

  async interpret(rawGuidance: string): Promise<Guidance> {
    const trimmed = rawGuidance.trim();
    if (!trimmed) {
      return {
        summary: "Default role rubric",
        maxNoticeDays: null,
        requiredLocation: null,
        priorityTerms: [],
        deprioritizedTerms: [],
        experienceWeightDelta: 0,
        interpretedBy: "local"
      };
    }

    try {
      const aiResult = await this.openai.interpretGuidance(trimmed);
      if (aiResult) return { ...aiResult, interpretedBy: "openai" };
    } catch (error) {
      console.warn("OpenAI guidance parsing failed; using local parser.", error);
    }

    return this.localInterpretation(trimmed);
  }

  localInterpretation(rawGuidance: string): Guidance {
    const guidance = rawGuidance.toLowerCase();
    const strictLanguage = /\b(must|required?|only|within|no more than)\b/.test(guidance);
    let maxNoticeDays: number | null = null;
    const noticeMatch = guidance.match(/within\s+(\d+)\s+days?/);
    if (noticeMatch) maxNoticeDays = Number(noticeMatch[1]);
    if (strictLanguage && /available immediately|immediate availability/.test(guidance)) maxNoticeDays = 0;

    const locations = ["dubai", "riyadh", "abu dhabi", "cairo", "doha", "jeddah", "sharjah", "amman"];
    const location = locations.find((item) => guidance.includes(item)) ?? null;
    const requiredLocation = strictLanguage ? location : null;

    const priorityTerms: string[] = [];
    const termPatterns: Array<[RegExp, string]> = [
      [/client[- ]facing|customer[- ]facing/, "client-facing"],
      [/available immediately|immediate availability/, "immediate availability"],
      [/arabic/, "Arabic"],
      [/saas/, "SaaS"],
      [/leadership|people management/, "leadership"],
      [/startup/, "startup experience"]
    ];
    for (const [pattern, term] of termPatterns) if (pattern.test(guidance)) priorityTerms.push(term);
    if (location && !requiredLocation) priorityTerms.push(location);

    const experienceWeightDelta = /over years|more than years|less emphasis on experience/.test(guidance)
      ? -5
      : /prioriti[sz]e experience|years of experience matter/.test(guidance)
        ? 5
        : 0;

    const summaryParts = [
      maxNoticeDays !== null ? `availability within ${maxNoticeDays} days` : null,
      requiredLocation ? `location restricted to ${requiredLocation}` : null,
      priorityTerms.length ? `prioritize ${priorityTerms.join(", ")}` : null,
      experienceWeightDelta < 0 ? "reduce emphasis on years" : null,
      experienceWeightDelta > 0 ? "increase emphasis on years" : null
    ].filter(Boolean);

    return {
      summary: summaryParts.join("; ") || "Custom recruiter guidance",
      maxNoticeDays,
      requiredLocation,
      priorityTerms,
      deprioritizedTerms: [],
      experienceWeightDelta,
      interpretedBy: "local"
    };
  }
}

