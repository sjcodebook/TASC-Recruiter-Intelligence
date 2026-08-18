const TERM_ALIASES: Record<string, string[]> = {
  "go to market": ["gtm", "product launch", "market launch"],
  "b2b outreach": ["outbound prospecting", "lead generation", "pipeline generation"],
  "crm tools": ["salesforce", "hubspot", "customer relationship management"],
  "full cycle recruiting": ["talent acquisition", "end to end recruiting", "recruiting"],
  sourcing: ["candidate sourcing", "talent sourcing"],
  "rest apis": ["api development", "restful api", "express"],
  postgresql: ["postgres", "sql database"],
  "python r": ["python", "r"],
  "data visualization": ["tableau", "power bi", "dashboarding"],
  "ci cd pipelines": ["continuous integration", "continuous deployment", "ci cd"],
  "aws azure": ["aws", "azure", "cloud infrastructure"],
  "ticketing systems": ["zendesk", "ticketing", "customer support platform"],
  "employee relations": ["hr business partner", "people operations"],
  "financial modeling": ["fp a", "financial analysis", "forecasting"],
  "uae commercial law": ["commercial law", "uae law"],
  "client facing": ["customer facing", "stakeholder management", "account management"]
};

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[+/]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length > 1));
}

export function termMatches(term: string, candidateText: string): boolean {
  const normalizedTerm = normalizeText(term);
  const normalizedCandidate = normalizeText(candidateText);
  if (!normalizedTerm) return false;
  if (normalizedCandidate.includes(normalizedTerm)) return true;
  const aliases = TERM_ALIASES[normalizedTerm] ?? [];
  if (aliases.some((alias) => normalizedCandidate.includes(normalizeText(alias)))) return true;

  const requiredTokens = [...tokens(normalizedTerm)].filter(
    (token) => !["and", "with", "tools", "systems", "experience"].includes(token)
  );
  if (requiredTokens.length === 0) return false;
  const candidateTokens = tokens(normalizedCandidate);
  const overlap = requiredTokens.filter((token) => candidateTokens.has(token)).length;
  return overlap / requiredTokens.length >= 0.65;
}

export function localEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const normalized = normalizeText(text);
  const units = normalized.split(" ").filter(Boolean);
  const features = [...units, ...units.slice(0, -1).map((token, index) => `${token}_${units[index + 1]}`)];
  for (const feature of features) {
    let hash = 2166136261;
    for (let index = 0; index < feature.length; index += 1) {
      hash ^= feature.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = Math.abs(hash) % dimensions;
    vector[bucket] += hash % 2 === 0 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function vectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => value.toFixed(8)).join(",")}]`;
}

