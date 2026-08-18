import { Service } from "@freshgum/typedi";
import type { Request, Response } from "express";
import { ApproveRequestSchema, MatchRequestSchema, RunIdSchema } from "../domain/schemas.js";
import { MatchService } from "../services/match.service.js";

@Service([MatchService])
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  create = async (request: Request, response: Response): Promise<void> => {
    const input = MatchRequestSchema.parse(request.body);
    response.status(201).json(await this.matchService.run(input));
  };

  approve = async (request: Request, response: Response): Promise<void> => {
    const { candidateIds } = ApproveRequestSchema.parse(request.body);
    const rawRunId = Array.isArray(request.params.runId) ? request.params.runId[0] : request.params.runId;
    const runId = RunIdSchema.parse(rawRunId);
    const markdown = await this.matchService.approve(runId, candidateIds);
    response.json({ markdown });
  };
}
