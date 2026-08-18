import { Service } from "@freshgum/typedi";
import { CandidateRepository } from "../repositories/candidate.repository.js";
import { DatabaseService } from "../infrastructure/database/database.service.js";
import { OpenAIGateway } from "../infrastructure/openai/openai.gateway.js";

@Service([CandidateRepository, DatabaseService, OpenAIGateway])
export class MetaService {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly database: DatabaseService,
    private readonly openai: OpenAIGateway
  ) {}

  async read(): Promise<{
    aiMode: "openai";
    candidateCount: number;
    uniqueProfileCount: number;
    pgvectorVersion: string;
  }> {
    const [counts, extension] = await Promise.all([
      this.candidates.counts(),
      this.database.query<{ extversion: string }>("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
    ]);
    return {
      aiMode: this.openai.mode,
      candidateCount: counts.total,
      uniqueProfileCount: counts.uniqueProfiles,
      pgvectorVersion: extension.rows[0]?.extversion ?? "unavailable"
    };
  }
}
