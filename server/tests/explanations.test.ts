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

  it("deduplicates punctuation-only question variants and fills from grounded fallbacks", () => {
    const result = sanitizeCandidateExplanation({
      whyFit: "The candidate has relevant recruiting evidence.",
      gaps: ["Dubai work arrangements need confirmation."],
      clarifyingQuestions: [
        "Can you confirm availability to work in Dubai?——?",
        "Can you confirm availability to work in Dubai?",
        "Which technical roles have you recruited for?"
      ]
    }, [
      "What measurable outcome best demonstrates your recruiting impact?",
      "Which part of the role would require the most ramp-up?"
    ]);

    expect(result.clarifyingQuestions).toEqual([
      "Can you confirm availability to work in Dubai?",
      "Which technical roles have you recruited for?",
      "What measurable outcome best demonstrates your recruiting impact?"
    ]);
  });
});
