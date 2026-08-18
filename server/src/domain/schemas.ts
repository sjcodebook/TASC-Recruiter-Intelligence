import { z } from "zod";

export const MatchRequestSchema = z.object({
  roleId: z.string().min(1),
  guidance: z.string().trim().max(800).default(""),
  limit: z.number().int().min(1).max(10).default(5),
  guidanceOverrides: z.object({
    locationMode: z.enum(["required", "preferred"]).optional(),
    availabilityMode: z.enum(["required", "preferred"]).optional(),
    experienceMode: z.enum(["required", "preferred"]).optional(),
    termModes: z.record(z.string(), z.enum(["required", "preferred"])).optional()
  }).default({})
});

export const ApproveRequestSchema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(10)
    .refine((candidateIds) => new Set(candidateIds).size === candidateIds.length, {
      message: "Candidate IDs must be unique"
    })
});

export const RunIdSchema = z.uuid();

const GuidanceModeSchema = z.enum(["required", "preferred"]);

const LocationCriterionSchema = z.object({
  values: z.array(z.string().min(1)).min(1).max(6),
  mode: GuidanceModeSchema,
  excluded: z.boolean(),
  sourceText: z.string()
});

const AvailabilityCriterionSchema = z.object({
  value: z.number().int().nonnegative(),
  mode: GuidanceModeSchema,
  sourceText: z.string()
});

const TermCriterionSchema = z.object({
  value: z.string().min(1),
  mode: GuidanceModeSchema,
  excluded: z.boolean(),
  sourceText: z.string()
});

const ExperienceCriterionSchema = z.object({
  minYears: z.number().nonnegative().nullable(),
  maxYears: z.number().nonnegative().nullable(),
  mode: GuidanceModeSchema,
  sourceText: z.string()
}).refine((criterion) => criterion.minYears !== null || criterion.maxYears !== null, {
  message: "An experience criterion needs a minimum or maximum"
});

export const GuidanceSchema = z.object({
  summary: z.string(),
  location: LocationCriterionSchema.nullable(),
  availability: AvailabilityCriterionSchema.nullable(),
  terms: z.array(TermCriterionSchema).max(8),
  experience: ExperienceCriterionSchema.nullable(),
  experienceWeightDelta: z.union([z.literal(-5), z.literal(0), z.literal(5)])
});

export const ExplanationBatchSchema = z.object({
  candidates: z.array(
    z.object({
      candidateId: z.string(),
      whyFit: z.string().max(700),
      gaps: z.array(z.string()).min(1).max(5),
      clarifyingQuestions: z.array(z.string()).length(3)
    })
  )
});
