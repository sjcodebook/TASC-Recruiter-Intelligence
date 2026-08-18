import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { MatchRepository } from "../src/repositories/match.repository.js";

describe("API error responses", () => {
  it("returns 400 for malformed JSON without exposing parser internals", async () => {
    const response = await request(createApp())
      .post("/api/matches")
      .set("Content-Type", "application/json")
      .send("{bad");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Request body contains invalid JSON.",
      code: "INVALID_JSON"
    });
  });

  it("returns 400 for a malformed match-run UUID before querying PostgreSQL", async () => {
    const response = await request(createApp())
      .post("/api/matches/not-a-uuid/approve")
      .send({ candidateIds: ["C001"] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
  });

  it("returns a not-found application error for an unknown match run", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const repository = new MatchRepository(database as never);

    await expect(repository.approveAndBuildMarkdown(
      "11111111-1111-4111-8111-111111111111",
      ["C001"]
    )).rejects.toMatchObject({ status: 404, code: "MATCH_RUN_NOT_FOUND" });
  });

  it("rejects candidates that do not belong to the requested match run", async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ run_id: "run" }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    };
    const repository = new MatchRepository(database as never);

    await expect(repository.approveAndBuildMarkdown(
      "11111111-1111-4111-8111-111111111111",
      ["C999"]
    )).rejects.toMatchObject({ status: 422, code: "INVALID_CANDIDATE_SELECTION" });
    expect(database.query).toHaveBeenCalledTimes(2);
  });
});
