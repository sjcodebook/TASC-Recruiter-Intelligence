import { Service } from "@freshgum/typedi";
import { DatabaseService } from "../infrastructure/database/database.service.js";
import type { MatchResponse, MatchStatus, RankedCandidate } from "../domain/types.js";
import { AppError } from "../http/app-error.js";

type MatchResponseMetadata = Omit<
  MatchResponse,
  "runId" | "status" | "explanationError" | "candidates" | "generatedAt"
>;

type StoredRunRow = {
  status: MatchStatus;
  response_metadata: MatchResponseMetadata;
  cache_key: string | null;
  failure_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  result_payload: RankedCandidate | null;
};

type BriefRow = {
  role_title: string;
  role_location: string;
  candidate_id: string;
  headline: string;
  score: string;
  confidence: string;
  location: string | null;
  notice_period: string | null;
  explanation: {
    whyFit: string;
    gaps: string[];
    clarifyingQuestions: string[];
    matchedRequiredSkills: string[];
    roleFitScore?: number;
    preferenceScore?: number | null;
  };
};

function explanationPayload(candidate: RankedCandidate) {
  return {
    whyFit: candidate.whyFit,
    gaps: candidate.gaps,
    clarifyingQuestions: candidate.clarifyingQuestions,
    matchedRequiredSkills: candidate.matchedRequiredSkills,
    roleFitScore: candidate.roleFitScore,
    preferenceScore: candidate.preferenceScore
  };
}

function responseMetadata(response: MatchResponse): MatchResponseMetadata {
  const {
    runId: _runId,
    status: _status,
    explanationError: _explanationError,
    candidates: _candidates,
    generatedAt: _generatedAt,
    ...metadata
  } = response;
  return metadata;
}

function restoreCandidate(candidate: RankedCandidate): RankedCandidate {
  return {
    ...candidate,
    scoreBreakdown: {
      requiredSkills: candidate.scoreBreakdown.requiredSkills,
      evidence: candidate.scoreBreakdown.evidence,
      experience: candidate.scoreBreakdown.experience,
      preferredSkills: candidate.scoreBreakdown.preferredSkills,
      roleLocation: candidate.scoreBreakdown.roleLocation,
      recruiterGuidance: candidate.scoreBreakdown.recruiterGuidance
    }
  };
}

@Service([DatabaseService])
export class MatchRepository {
  constructor(private readonly database: DatabaseService) {}

  async saveRun(response: MatchResponse, rawGuidance: string, cacheKey: string): Promise<void> {
    const runValues: unknown[] = [
      response.runId,
      response.role.roleId,
      rawGuidance,
      JSON.stringify(response.guidance),
      response.aiMode,
      response.status,
      JSON.stringify(responseMetadata(response)),
      cacheKey,
      response.explanationError
    ];
    if (response.candidates.length === 0) {
      await this.database.query(
        `INSERT INTO match_runs (
          run_id, role_id, raw_guidance, interpreted_guidance, ai_mode,
          status, response_metadata, cache_key, failure_message
        ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8,$9)`,
        runValues
      );
      return;
    }

    const values = [...runValues];
    const rows = response.candidates.map((candidate, index) => {
      const offset = 9 + index * 7;
      values.push(
        candidate.candidateId,
        candidate.rank,
        candidate.score,
        candidate.confidence,
        JSON.stringify(candidate.scoreBreakdown),
        JSON.stringify(explanationPayload(candidate)),
        JSON.stringify(candidate)
      );
      return `($${offset + 1}::text,$${offset + 2}::integer,$${offset + 3}::numeric,$${offset + 4}::numeric,$${offset + 5}::jsonb,$${offset + 6}::jsonb,$${offset + 7}::jsonb)`;
    });

    await this.database.query(
      `WITH inserted_run AS (
        INSERT INTO match_runs (
          run_id, role_id, raw_guidance, interpreted_guidance, ai_mode,
          status, response_metadata, cache_key, failure_message
        ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8,$9)
        RETURNING run_id
      )
      INSERT INTO match_results (
        run_id, candidate_id, rank, score, confidence, score_breakdown, explanation, result_payload
      )
      SELECT inserted_run.run_id, result.candidate_id, result.rank, result.score,
        result.confidence, result.score_breakdown, result.explanation, result.result_payload
      FROM inserted_run
      CROSS JOIN (VALUES ${rows.join(",")}) AS result(
        candidate_id, rank, score, confidence, score_breakdown, explanation, result_payload
      )`,
      values
    );
  }

  async findRun(runId: string): Promise<{ response: MatchResponse; cacheKey: string }> {
    const result = await this.database.query<StoredRunRow>(
      `SELECT run.status, run.response_metadata, run.cache_key, run.failure_message,
        run.created_at, run.updated_at, result.result_payload
      FROM match_runs run
      LEFT JOIN match_results result ON result.run_id = run.run_id
      WHERE run.run_id = $1
      ORDER BY result.rank`,
      [runId]
    );
    if (result.rows.length === 0) {
      throw AppError.notFound("The requested match run was not found.", "MATCH_RUN_NOT_FOUND");
    }
    const first = result.rows[0];
    if (!first.response_metadata?.role || !first.cache_key) {
      throw AppError.conflict(
        "This match run predates resumable evidence generation. Please run the match again.",
        "LEGACY_MATCH_RUN"
      );
    }
    return {
      cacheKey: first.cache_key,
      response: {
        ...first.response_metadata,
        runId,
        status: first.status,
        explanationError: first.failure_message,
        generatedAt: new Date(first.updated_at ?? first.created_at).toISOString(),
        candidates: result.rows
          .map((row) => row.result_payload)
          .filter((candidate): candidate is RankedCandidate => candidate !== null)
          .map(restoreCandidate)
      }
    };
  }

  async findCompletedByCacheKey(cacheKey: string): Promise<MatchResponse | null> {
    const result = await this.database.query<{ run_id: string }>(
      `SELECT run_id
       FROM match_runs
       WHERE cache_key = $1 AND status = 'complete' AND response_metadata <> '{}'::jsonb
       ORDER BY updated_at DESC
       LIMIT 1`,
      [cacheKey]
    );
    if (!result.rows[0]) return null;
    return (await this.findRun(result.rows[0].run_id)).response;
  }

  async claimFinalization(runId: string): Promise<{ claimed: boolean; status: MatchStatus }> {
    const claimed = await this.database.query<{ status: MatchStatus }>(
      `UPDATE match_runs
       SET status = 'explaining', failure_message = NULL, updated_at = NOW()
       WHERE run_id = $1 AND (
         status IN ('ranking_ready', 'failed')
         OR (status = 'explaining' AND updated_at < NOW() - INTERVAL '45 seconds')
       )
       RETURNING status`,
      [runId]
    );
    if (claimed.rows[0]) return { claimed: true, status: claimed.rows[0].status };

    const existing = await this.database.query<{ status: MatchStatus }>(
      "SELECT status FROM match_runs WHERE run_id = $1",
      [runId]
    );
    if (!existing.rows[0]) {
      throw AppError.notFound("The requested match run was not found.", "MATCH_RUN_NOT_FOUND");
    }
    return { claimed: false, status: existing.rows[0].status };
  }

  async completeRun(runId: string, candidates: RankedCandidate[]): Promise<void> {
    await this.database.transaction(async (client) => {
      for (const candidate of candidates) {
        await client.query(
          `UPDATE match_results
           SET explanation = $3::jsonb, result_payload = $4::jsonb
           WHERE run_id = $1 AND candidate_id = $2`,
          [
            runId,
            candidate.candidateId,
            JSON.stringify(explanationPayload(candidate)),
            JSON.stringify(candidate)
          ]
        );
      }
      await client.query(
        `UPDATE match_runs
         SET status = 'complete', failure_message = NULL, updated_at = NOW()
         WHERE run_id = $1`,
        [runId]
      );
    });
  }

  async failRun(runId: string, message: string): Promise<void> {
    await this.database.query(
      `UPDATE match_runs
       SET status = 'failed', failure_message = $2, updated_at = NOW()
       WHERE run_id = $1`,
      [runId, message]
    );
  }

  async approveAndBuildMarkdown(runId: string, candidateIds: string[]): Promise<string> {
    const run = await this.database.query<{ run_id: string; status: MatchStatus }>(
      "SELECT run_id, status FROM match_runs WHERE run_id = $1",
      [runId]
    );
    if (run.rows.length === 0) {
      throw AppError.notFound("The requested match run was not found.", "MATCH_RUN_NOT_FOUND");
    }
    if (run.rows[0].status !== "complete") {
      throw AppError.conflict(
        "The evidence brief is still being generated. Please wait for the match to complete.",
        "MATCH_NOT_COMPLETE"
      );
    }

    const result = await this.database.query<BriefRow>(
      `SELECT r.title AS role_title, r.location AS role_location,
        c.candidate_id, c.headline, mr.score, mr.confidence,
        c.location, c.notice_period, mr.explanation
      FROM match_results mr
      JOIN match_runs run ON run.run_id = mr.run_id
      JOIN roles r ON r.role_id = run.role_id
      JOIN candidates c ON c.candidate_id = mr.candidate_id
      WHERE mr.run_id = $1 AND c.candidate_id = ANY($2::text[])
      ORDER BY mr.rank`,
      [runId, candidateIds]
    );
    if (result.rows.length !== candidateIds.length) {
      throw AppError.unprocessable(
        "One or more selected candidates do not belong to this match run.",
        "INVALID_CANDIDATE_SELECTION"
      );
    }
    await this.database.query(
      "UPDATE match_runs SET approved_candidate_ids = $2, updated_at = NOW() WHERE run_id = $1",
      [runId, candidateIds]
    );
    const header = `# Candidate shortlist: ${result.rows[0].role_title}\n\n**Location:** ${result.rows[0].role_location}\n\n`;
    const sections = result.rows.map((row, index) => {
      const gaps = row.explanation.gaps.map((gap) => `- ${gap}`).join("\n");
      const questions = row.explanation.clarifyingQuestions
        .map((question, questionIndex) => `${questionIndex + 1}. ${question}`)
        .join("\n");
      return `## ${index + 1}. ${row.candidate_id} - ${row.headline}\n\n` +
        `**Match score:** ${Number(row.score).toFixed(1)}/100  \n` +
        `**Technical role fit:** ${Number(row.explanation.roleFitScore ?? row.score).toFixed(1)}/100  \n` +
        (row.explanation.preferenceScore === null || row.explanation.preferenceScore === undefined
          ? ""
          : `**Recruiter priorities:** ${Number(row.explanation.preferenceScore).toFixed(1)}/100  \n`) +
        `**Evidence confidence:** ${Math.round(Number(row.confidence))}%  \n` +
        `**Location:** ${row.location ?? "Not provided"}  \n` +
        `**Availability:** ${row.notice_period ?? "Not provided"}\n\n` +
        `### Why this candidate\n\n${row.explanation.whyFit}\n\n` +
        `### Gaps to validate\n\n${gaps}\n\n` +
        `### Recommended interview questions\n\n${questions}`;
    });
    return `${header}${sections.join("\n\n---\n\n")}\n`;
  }
}
