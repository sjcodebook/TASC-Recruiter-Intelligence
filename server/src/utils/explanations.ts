export type CandidateExplanation = {
  whyFit: string;
  gaps: string[];
  clarifyingQuestions: string[];
};

const FIELD_LEAK = /^(?:candidateId|whyFit|gaps|clarifyingQuestions)\s*[:=]/i;

function cleanText(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(/^[\s"'`\[\]{},]+/, "")
    .replace(/[\s"'`\[\]{},]+$/, "")
    .trim();
  return cleaned && !FIELD_LEAK.test(cleaned) ? cleaned : null;
}

function cleanList(values: string[]): string[] {
  return [...new Set(values.map(cleanText).filter((value): value is string => value !== null))];
}

export function sanitizeCandidateExplanation(input: CandidateExplanation): CandidateExplanation {
  const whyFit = cleanText(input.whyFit);
  const gaps = cleanList(input.gaps);
  const clarifyingQuestions = cleanList(input.clarifyingQuestions);

  if (!whyFit || gaps.length === 0 || clarifyingQuestions.length !== 3) {
    throw new Error("OpenAI returned malformed candidate explanation content.");
  }
  return { whyFit, gaps, clarifyingQuestions };
}
