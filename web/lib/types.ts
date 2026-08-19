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

export type LocationGuidanceCriterion = {
  values: string[];
  mode: GuidanceMode;
  excluded: boolean;
  sourceText: string;
};

export type ExperienceGuidanceCriterion = {
  minYears: number | null;
  maxYears: number | null;
  mode: GuidanceMode;
  sourceText: string;
};

export type TermGuidanceCriterion = GuidanceCriterion<string> & {
  excluded: boolean;
};

export type GuidanceOverrides = {
  locationMode?: GuidanceMode;
  availabilityMode?: GuidanceMode;
  experienceMode?: GuidanceMode;
  termModes?: Record<string, GuidanceMode>;
};

export type Guidance = {
  summary: string;
  location: LocationGuidanceCriterion | null;
  availability: GuidanceCriterion<number> | null;
  terms: TermGuidanceCriterion[];
  experience: ExperienceGuidanceCriterion | null;
  experienceWeightDelta: number;
  interpretedBy: "hybrid" | "local";
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
  eligibleWithoutExperience: boolean;
  qualified: boolean;
  meetsMinimumExperience: boolean | null;
  meetsRoleRelevanceThreshold: boolean;
  matchedRequiredSkills: string[];
  missingRequiredSkills: string[];
  matchedPreferredSkills: string[];
  matchedGuidanceTerms: string[];
  scoreBreakdown: Record<string, number>;
  whyFit: string;
  gaps: string[];
  clarifyingQuestions: string[];
};

export type MatchStatus = "ranking_ready" | "explaining" | "complete" | "failed";

export type MatchResponse = {
  runId: string;
  status: MatchStatus;
  explanationError: string | null;
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
  belowMinimumExperienceCount: number;
  minimumExperienceYears: number;
  appliedConstraints: string[];
};

export type Meta = {
  aiMode: "openai";
  candidateCount: number;
  uniqueProfileCount: number;
  pgvectorVersion: string;
};
