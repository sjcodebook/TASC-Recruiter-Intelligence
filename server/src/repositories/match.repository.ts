import { Service } from "@freshgum/typedi";
import { DatabaseService } from "../infrastructure/database/database.service.js";
import type { Guidance, RankedCandidate } from "../domain/types.js";
import { AppError } from "../http/app-error.js";

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

@Service([DatabaseService])
export class MatchRepository {
  constructor(private readonly database: DatabaseService) {}

  async saveRun(input: {
    runId: string;
    roleId: string;
    rawGuidance: string;
    guidance: Guidance;
    aiMode: "openai" | "local";
    candidates: RankedCandidate[];
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO match_runs (run_id, role_id, raw_guidance, interpreted_guidance, ai_mode)
         VALUES ($1,$2,$3,$4::jsonb,$5)`,
        [input.runId, input.roleId, input.rawGuidance, JSON.stringify(input.guidance), input.aiMode]
      );
      for (const candidate of input.candidates) {
        await client.query(
          `INSERT INTO match_results (
            run_id, candidate_id, rank, score, confidence, score_breakdown, explanation
          ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
          [
            input.runId,
            candidate.candidateId,
            candidate.rank,
            candidate.score,
            candidate.confidence,
            JSON.stringify(candidate.scoreBreakdown),
            JSON.stringify({
              whyFit: candidate.whyFit,
              gaps: candidate.gaps,
              clarifyingQuestions: candidate.clarifyingQuestions,
              matchedRequiredSkills: candidate.matchedRequiredSkills,
              roleFitScore: candidate.roleFitScore,
              preferenceScore: candidate.preferenceScore
            })
          ]
        );
      }
    });
  }

  async approveAndBuildMarkdown(runId: string, candidateIds: string[]): Promise<string> {
    const run = await this.database.query<{ run_id: string }>(
      "SELECT run_id FROM match_runs WHERE run_id = $1",
      [runId]
    );
    if (run.rows.length === 0) {
      throw AppError.notFound("The requested match run was not found.", "MATCH_RUN_NOT_FOUND");
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
      "UPDATE match_runs SET approved_candidate_ids = $2 WHERE run_id = $1",
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
