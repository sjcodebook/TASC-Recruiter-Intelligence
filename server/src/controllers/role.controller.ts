import { Service } from "@freshgum/typedi";
import type { Request, Response } from "express";
import { RoleRepository } from "../repositories/role.repository.js";

@Service([RoleRepository])
export class RoleController {
  constructor(private readonly roles: RoleRepository) {}

  list = async (_request: Request, response: Response): Promise<void> => {
    response.json({ roles: await this.roles.list() });
  };
}

