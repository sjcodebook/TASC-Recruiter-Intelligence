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
    .replace(/[—–-]+(?=[\s?!.]*$)/g, "")
    .replace(/([?!.])(?:\s*[?!.])+$/, "$1")
    .trim();
  return cleaned && !FIELD_LEAK.test(cleaned) ? cleaned : null;
}

function cleanList(values: string[]): string[] {
  return [...new Set(values.map(cleanText).filter((value): value is string => value !== null))];
}

function questionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function distinctQuestions(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) continue;
    const key = questionKey(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

export function sanitizeCandidateExplanation(
  input: CandidateExplanation,
  fallbackQuestions: string[] = []
): CandidateExplanation {
  const whyFit = cleanText(input.whyFit);
  const gaps = cleanList(input.gaps);
  const clarifyingQuestions = distinctQuestions([
    ...input.clarifyingQuestions,
    ...fallbackQuestions
  ]).slice(0, 3);

  if (!whyFit || gaps.length === 0 || clarifyingQuestions.length !== 3) {
    throw new Error("OpenAI returned malformed candidate explanation content.");
  }
  return { whyFit, gaps, clarifyingQuestions };
}
