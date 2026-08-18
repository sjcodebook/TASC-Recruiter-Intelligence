export type DataQualityIssue = {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
};

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

export type Candidate = {
  candidateId: string;
  headline: string;
  skills: string[];
  experienceYears: number | null;
  pastRoles: string;
  certifications: string | null;
  education: string | null;
  projects: string | null;
  extraCurriculars: string | null;
  location: string | null;
  normalizedLocation: string | null;
  noticePeriod: string | null;
  noticeDays: number | null;
  profileText: string;
  contentFingerprint: string;
  dataQuality: DataQualityIssue[];
  semanticSimilarity?: number;
  duplicateIds?: string[];
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

export type ScoreBreakdown = {
  requiredSkills: number;
  evidence: number;
  experience: number;
  preferredSkills: number;
  roleLocation: number;
  recruiterGuidance: number;
};

export type RankedCandidate = Candidate & {
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
  scoreBreakdown: ScoreBreakdown;
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
  qualifiedCount: number;
  appliedConstraints: string[];
};
