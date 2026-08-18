import { describe, expect, it } from "vitest";
import { GuidanceService } from "../src/services/guidance.service.js";

const service = new GuidanceService({
  interpretGuidance: async () => ({
    summary: "",
    location: null,
    availability: null,
    priorityTerms: [],
    deprioritizedTerms: [],
    experienceWeightDelta: 0
  })
} as never);

describe("local recruiter guidance interpretation", () => {
  it("treats explicit constraint language as a hard filter", () => {
    const result = service.localInterpretation("Must be in Dubai and available within 30 days");
    expect(result.location).toMatchObject({ value: "dubai", mode: "required" });
    expect(result.availability).toMatchObject({ value: 30, mode: "required" });
  });

  it("keeps preference language soft and adjusts the rubric", () => {
    const result = service.localInterpretation(
      "We value client-facing experience over years of experience"
    );
    expect(result.location).toBeNull();
    expect(result.priorityTerms).toContain("client-facing");
    expect(result.experienceWeightDelta).toBe(-5);
  });

  it("classifies mixed clauses independently", () => {
    const result = service.localInterpretation(
      "Prioritize candidates available immediately and have to be from Dubai"
    );
    expect(result.availability).toMatchObject({ value: 0, mode: "preferred" });
    expect(result.location).toMatchObject({ value: "dubai", mode: "required" });
  });

  it("supports an explicit recruiter override without changing the extracted value", async () => {
    const result = await service.interpret(
      "Prioritize candidates available immediately and have to be from Dubai",
      { availabilityMode: "required", locationMode: "preferred" }
    );
    expect(result.availability).toMatchObject({ value: 0, mode: "required" });
    expect(result.location).toMatchObject({ value: "dubai", mode: "preferred" });
  });

  it("does not double-count structured AI criteria as free-form priorities", async () => {
    const aiService = new GuidanceService({
      interpretGuidance: async () => ({
        summary: "",
        location: { value: "dubai", mode: "required", sourceText: "from Dubai" },
        availability: { value: 0, mode: "preferred", sourceText: "available immediately" },
        priorityTerms: ["immediate availability", "Dubai-based", "e-commerce"],
        deprioritizedTerms: [],
        experienceWeightDelta: 0,
        interpretedBy: "openai"
      })
    } as never);

    const result = await aiService.interpret(
      "Prioritize candidates available immediately and have to be from Dubai"
    );

    expect(result.priorityTerms).toEqual(["e-commerce"]);
    expect(result.summary).toBe(
      "Require dubai-based candidates; Prefer immediate availability, e-commerce."
    );
  });
});
