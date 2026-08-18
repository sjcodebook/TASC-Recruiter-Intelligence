import { describe, expect, it } from "vitest";
import type { Guidance } from "../src/domain/types.js";
import { GuidanceService, modeForGuidanceClause } from "../src/services/guidance.service.js";

const emptyAiResult: Omit<Guidance, "interpretedBy"> = {
  summary: "",
  location: null,
  availability: null,
  terms: [],
  experience: null,
  experienceWeightDelta: 0
};

function serviceWithAi(result: Omit<Guidance, "interpretedBy"> = emptyAiResult) {
  return new GuidanceService({ interpretGuidance: async () => result } as never);
}

const service = serviceWithAi();

describe("recruiter guidance interpretation", () => {
  it("treats should and explicit constraint language as required", () => {
    const should = service.localInterpretation("Should be in Dubai");
    expect(should.location).toMatchObject({ values: ["dubai"], mode: "required", excluded: false });

    const explicit = service.localInterpretation("Must be in Dubai and available within 30 days");
    expect(explicit.location).toMatchObject({ values: ["dubai"], mode: "required" });
    expect(explicit.availability).toMatchObject({ value: 30, mode: "required" });
  });

  it("lets explicit soft language win over hard-looking words in the same clause", () => {
    expect(modeForGuidanceClause("Ideally should be in Dubai")).toBe("preferred");
    expect(modeForGuidanceClause("Prefer candidates available within 30 days")).toBe("preferred");

    const result = service.localInterpretation(
      "Ideally should be in Dubai and prefer candidates available within 30 days"
    );
    expect(result.location?.mode).toBe("preferred");
    expect(result.availability).toMatchObject({ value: 30, mode: "preferred" });
  });

  it("does not reverse relaxed or negated requirements", () => {
    expect(service.localInterpretation("Dubai is not required").location).toBeNull();
    expect(service.localInterpretation("Candidates don't have to be in Dubai").location).toBeNull();
    expect(service.localInterpretation("Arabic is optional").terms).toEqual([]);
  });

  it("supports excluded and alternative locations", () => {
    const excluded = service.localInterpretation("Must not be in Dubai");
    expect(excluded.location).toMatchObject({
      values: ["dubai"],
      mode: "required",
      excluded: true
    });

    const alternatives = service.localInterpretation("Dubai or Abu Dhabi only");
    expect(alternatives.location).toMatchObject({
      values: ["dubai", "abu dhabi"],
      mode: "required",
      excluded: false
    });
  });

  it("extracts required evidence and numeric experience constraints", () => {
    const result = service.localInterpretation(
      "Must have Arabic and at least 5 years of experience"
    );
    expect(result.terms).toEqual([
      expect.objectContaining({ value: "Arabic", mode: "required", excluded: false })
    ]);
    expect(result.experience).toMatchObject({ minYears: 5, maxYears: null, mode: "required" });
  });

  it("supports excluded evidence terms", () => {
    const result = service.localInterpretation("Must be without startup experience");
    expect(result.terms).toEqual([
      expect.objectContaining({ value: "startup experience", mode: "required", excluded: true })
    ]);
  });

  it("normalizes availability expressed in weeks and months", () => {
    const weeks = service.localInterpretation("Prefer candidates available in 2 weeks");
    expect(weeks.availability).toMatchObject({ value: 14, mode: "preferred" });

    const month = service.localInterpretation("Available within 1 month");
    expect(month.availability).toMatchObject({ value: 30, mode: "required" });
  });

  it("classifies mixed clauses independently", () => {
    const result = service.localInterpretation(
      "Prioritize candidates available immediately and have to be from Dubai"
    );
    expect(result.availability).toMatchObject({ value: 0, mode: "preferred" });
    expect(result.location).toMatchObject({ values: ["dubai"], mode: "required" });
  });

  it("keeps client-facing preference soft and adjusts the technical rubric", () => {
    const result = service.localInterpretation(
      "We value client-facing experience over years of experience"
    );
    expect(result.terms).toEqual([
      expect.objectContaining({ value: "client-facing", mode: "preferred" })
    ]);
    expect(result.experienceWeightDelta).toBe(-5);
  });

  it("applies recruiter overrides to every structured criterion", async () => {
    const result = await service.interpret(
      "Should be in Dubai and must have Arabic and at least 5 years of experience",
      {
        locationMode: "preferred",
        experienceMode: "preferred",
        termModes: { Arabic: "preferred" }
      }
    );
    expect(result.location?.mode).toBe("preferred");
    expect(result.experience?.mode).toBe("preferred");
    expect(result.terms[0]?.mode).toBe("preferred");
  });

  it("reclassifies AI-extracted values with deterministic precedence", async () => {
    const aiService = serviceWithAi({
      ...emptyAiResult,
      location: {
        values: ["Muscat"],
        mode: "preferred" as const,
        excluded: false,
        sourceText: "should be in Muscat"
      },
      terms: [{
        value: "Kubernetes",
        mode: "preferred" as const,
        excluded: false,
        sourceText: "must have Kubernetes"
      }]
    });
    const result = await aiService.interpret("Should be in Muscat and must have Kubernetes");
    expect(result.location).toMatchObject({ values: ["muscat"], mode: "required" });
    expect(result.terms).toEqual([
      expect.objectContaining({ value: "Kubernetes", mode: "required" })
    ]);
    expect(result.interpretedBy).toBe("hybrid");
  });

  it("does not double-count structured criteria as free-form terms", async () => {
    const aiService = serviceWithAi({
      ...emptyAiResult,
      location: {
        values: ["Dubai"],
        mode: "required" as const,
        excluded: false,
        sourceText: "have to be from Dubai"
      },
      availability: {
        value: 0,
        mode: "preferred" as const,
        sourceText: "prioritize candidates available immediately"
      },
      terms: [
        { value: "immediate availability", mode: "preferred" as const, excluded: false, sourceText: "prioritize candidates available immediately" },
        { value: "Dubai-based", mode: "required" as const, excluded: false, sourceText: "have to be from Dubai" },
        { value: "e-commerce", mode: "preferred" as const, excluded: false, sourceText: "prioritize e-commerce" }
      ]
    });

    const result = await aiService.interpret(
      "Prioritize candidates available immediately and have to be from Dubai"
    );
    expect(result.terms.map((term) => term.value)).toEqual(["e-commerce"]);
    expect(result.summary).toBe(
      "Require dubai-based candidates; Prefer immediate availability, e-commerce."
    );
  });

  it("deduplicates semantically equivalent terms", async () => {
    const aiService = serviceWithAi({
      ...emptyAiResult,
      terms: [{
        value: "client-facing experience",
        mode: "preferred" as const,
        excluded: false,
        sourceText: "value client-facing experience"
      }],
      experienceWeightDelta: -5
    });

    const result = await aiService.interpret(
      "We value client-facing experience over years of experience"
    );
    expect(result.terms.map((term) => term.value)).toEqual(["client-facing"]);
    expect(result.summary).toBe(
      "Prefer client-facing; reduce emphasis on years of experience."
    );
  });
});
