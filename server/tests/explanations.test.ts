import { describe, expect, it } from "vitest";
import { sanitizeCandidateExplanation } from "../src/utils/explanations.js";

describe("candidate explanation output hygiene", () => {
  it("removes harmless serialization punctuation and leaked field fragments", () => {
    const result = sanitizeCandidateExplanation({
      whyFit: "Complete required-skill evidence and exact-city alignment.",
      gaps: [
        "Experience duration needs verification.",
        "A 90-day notice period may affect start timing.],\"",
        "clarifyingQuestions=["
      ],
      clarifyingQuestions: [
        "How many years of relevant experience do you have?",
        "Can the notice period be shortened?",
        "Which recent project best demonstrates the required skills?"
      ]
    });

    expect(result.gaps).toEqual([
      "Experience duration needs verification.",
      "A 90-day notice period may affect start timing."
    ]);
    expect(result.clarifyingQuestions).toHaveLength(3);
  });

  it("rejects output that cannot provide a complete recruiter brief", () => {
    expect(() => sanitizeCandidateExplanation({
      whyFit: "whyFit=",
      gaps: ["gaps=["],
      clarifyingQuestions: ["Only one question?"]
    })).toThrow("malformed candidate explanation");
  });
});
