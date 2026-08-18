import { z } from "zod";

export const MatchRequestSchema = z.object({
  roleId: z.string().min(1),
  guidance: z.string().trim().max(800).default(""),
  limit: z.number().int().min(1).max(10).default(5)
});

export const ApproveRequestSchema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(10)
    .refine((candidateIds) => new Set(candidateIds).size === candidateIds.length, {
      message: "Candidate IDs must be unique"
    })
});

export const RunIdSchema = z.uuid();

export const GuidanceSchema = z.object({
  summary: z.string(),
  maxNoticeDays: z.number().int().nonnegative().nullable(),
  requiredLocation: z.string().nullable(),
  priorityTerms: z.array(z.string()).max(8),
  deprioritizedTerms: z.array(z.string()).max(8),
  experienceWeightDelta: z.number().min(-10).max(10)
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
