import { describe, expect, it } from "vitest";
import { GuidanceService } from "../src/services/guidance.service.js";

const service = new GuidanceService({} as never);

describe("local recruiter guidance interpretation", () => {
  it("treats explicit constraint language as a hard filter", () => {
    const result = service.localInterpretation("Must be in Dubai and available within 30 days");
    expect(result.requiredLocation).toBe("dubai");
    expect(result.maxNoticeDays).toBe(30);
  });

  it("keeps preference language soft and adjusts the rubric", () => {
    const result = service.localInterpretation(
      "We value client-facing experience over years of experience"
    );
    expect(result.requiredLocation).toBeNull();
    expect(result.priorityTerms).toContain("client-facing");
    expect(result.experienceWeightDelta).toBe(-5);
  });
});
