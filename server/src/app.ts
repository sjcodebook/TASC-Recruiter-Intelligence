import { Container } from "@freshgum/typedi";
import compression from "compression";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { MatchController } from "./controllers/match.controller.js";
import { MetaController } from "./controllers/meta.controller.js";
import { RoleController } from "./controllers/role.controller.js";
import { asyncHandler } from "./http/async-handler.js";
import { AppError } from "./http/app-error.js";

export function createApp() {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: env.WEB_ORIGIN }));
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));

  // Composition root: container resolution is intentionally limited to startup.
  const metaController = Container.get(MetaController);
  const roleController = Container.get(RoleController);
  const matchController = Container.get(MatchController);

  app.get("/health", asyncHandler(metaController.health));
  app.get("/api/meta", asyncHandler(metaController.read));
  app.get("/api/roles", asyncHandler(roleController.list));
  app.post("/api/matches", asyncHandler(matchController.create));
  app.post("/api/matches/preflight", asyncHandler(matchController.preflight));
  app.post("/api/matches/prepare", asyncHandler(matchController.prepare));
  app.get("/api/matches/:runId", asyncHandler(matchController.read));
  app.post("/api/matches/:runId/finalize", asyncHandler(matchController.finalize));
  app.post("/api/matches/:runId/approve", asyncHandler(matchController.approve));

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "Invalid request", details: error.issues });
      return;
    }
    if (error instanceof AppError) {
      response.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof SyntaxError && typeof error === "object" && error !== null && "body" in error) {
      response.status(400).json({ error: "Request body contains invalid JSON.", code: "INVALID_JSON" });
      return;
    }
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number(error.status)
      : 500;
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      response.status(status).json({ error: "Request could not be processed.", code: "INVALID_REQUEST" });
      return;
    }
    console.error(error);
    response.status(500).json({ error: "Unexpected server error.", code: "INTERNAL_ERROR" });
  };
  app.use(errorHandler);
  return app;
}
