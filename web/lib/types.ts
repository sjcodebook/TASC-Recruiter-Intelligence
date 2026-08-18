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

export type GuidanceMode = "required" | "preferred";

export type GuidanceCriterion<T> = {
  value: T;
  mode: GuidanceMode;
  sourceText: string;
};

export type GuidanceOverrides = {
  locationMode?: GuidanceMode;
  availabilityMode?: GuidanceMode;
};

export type Guidance = {
  summary: string;
  location: GuidanceCriterion<string> | null;
  availability: GuidanceCriterion<number> | null;
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
  roleFitScore: number;
  preferenceScore: number | null;
  confidence: number;
  fitBand: "Strong" | "Promising" | "Stretch";
  eligible: boolean;
  qualified: boolean;
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
  aiMode: "openai";
  totalConsidered: number;
  duplicatesHidden: number;
  requestedLimit: number;
  eligibleCount: number;
  qualifiedCount: number;
  appliedConstraints: string[];
};

export type Meta = {
  aiMode: "openai";
  candidateCount: number;
  uniqueProfileCount: number;
  pgvectorVersion: string;
};
