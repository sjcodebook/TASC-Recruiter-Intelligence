export type Role = {
  roleId: string;
  title: string;
  department: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  experienceMin: number;
  experienceMax: number;
  seniority: string;
  location: string;
};

export type Guidance = {
  summary: string;
  maxNoticeDays: number | null;
  requiredLocation: string | null;
  priorityTerms: string[];
  deprioritizedTerms: string[];
  experienceWeightDelta: number;
  interpretedBy: "openai" | "local";
};

export type RankedCandidate = {
  candidateId: string;
  headline: string;
  skills: string[];
  experienceYears: number | null;
  pastRoles: string;
  projects: string | null;
  location: string | null;
  noticePeriod: string | null;
  dataQuality: Array<{ code: string; message: string; severity: "low" | "medium" | "high" }>;
  duplicateIds?: string[];
  rank: number;
  score: number;
  confidence: number;
  fitBand: "Strong" | "Promising" | "Stretch";
  eligible: boolean;
  matchedRequiredSkills: string[];
  missingRequiredSkills: string[];
  matchedPreferredSkills: string[];
  scoreBreakdown: Record<string, number>;
  whyFit: string;
  gaps: string[];
  clarifyingQuestions: string[];
};

export type MatchResponse = {
  runId: string;
  role: Role;
  guidance: Guidance;
  candidates: RankedCandidate[];
  generatedAt: string;
  aiMode: "openai" | "local";
  totalConsidered: number;
  duplicatesHidden: number;
  requestedLimit: number;
  eligibleCount: number;
  appliedConstraints: string[];
};

export type Meta = {
  aiMode: "openai" | "local";
  candidateCount: number;
  uniqueProfileCount: number;
  pgvectorVersion: string;
};
