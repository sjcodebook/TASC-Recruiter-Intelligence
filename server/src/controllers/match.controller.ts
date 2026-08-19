import { Service } from "@freshgum/typedi";
import type { Request, Response } from "express";
import { ApproveRequestSchema, MatchRequestSchema, RunIdSchema } from "../domain/schemas.js";
import { MatchService } from "../services/match.service.js";

@Service([MatchService])
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  private runId(request: Request): string {
    const rawRunId = Array.isArray(request.params.runId) ? request.params.runId[0] : request.params.runId;
    return RunIdSchema.parse(rawRunId);
  }

  create = async (request: Request, response: Response): Promise<void> => {
    const input = MatchRequestSchema.parse(request.body);
    response.status(201).json(await this.matchService.run(input));
  };

  preflight = async (request: Request, response: Response): Promise<void> => {
    const input = MatchRequestSchema.parse(request.body);
    await this.matchService.preflight(input);
    response.status(204).send();
  };

  prepare = async (request: Request, response: Response): Promise<void> => {
    const input = MatchRequestSchema.parse(request.body);
    response.status(201).json(await this.matchService.prepare(input));
  };

  finalize = async (request: Request, response: Response): Promise<void> => {
    response.json(await this.matchService.finalize(this.runId(request)));
  };

  read = async (request: Request, response: Response): Promise<void> => {
    response.json(await this.matchService.getRun(this.runId(request)));
  };

  approve = async (request: Request, response: Response): Promise<void> => {
    const { candidateIds } = ApproveRequestSchema.parse(request.body);
    const markdown = await this.matchService.approve(this.runId(request), candidateIds);
    response.json({ markdown });
  };
}
