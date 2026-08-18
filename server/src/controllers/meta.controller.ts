import { Service } from "@freshgum/typedi";
import type { Request, Response } from "express";
import { MetaService } from "../services/meta.service.js";
import { DatabaseService } from "../infrastructure/database/database.service.js";

@Service([MetaService, DatabaseService])
export class MetaController {
  constructor(
    private readonly meta: MetaService,
    private readonly database: DatabaseService
  ) {}

  health = async (_request: Request, response: Response): Promise<void> => {
    await this.database.query("SELECT 1");
    response.json({ status: "ok", service: "tasc-match-api" });
  };

  read = async (_request: Request, response: Response): Promise<void> => {
    response.json(await this.meta.read());
  };
}

