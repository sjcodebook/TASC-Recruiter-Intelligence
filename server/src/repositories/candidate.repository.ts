import { Service } from "@freshgum/typedi";
import { DatabaseService } from "../infrastructure/database/database.service.js";
import type { Candidate, DataQualityIssue } from "../domain/types.js";
import { vectorLiteral } from "../utils/text.js";

type CandidateRow = {
  candidate_id: string;
  headline: string;
  skills: string[];
  experience_years: string | number | null;
  past_roles: string | null;
  certifications: string | null;
  education: string | null;
  projects: string | null;
  extra_curriculars: string | null;
  location: string | null;
  normalized_location: string | null;
  notice_period: string | null;
  notice_days: number | null;
  profile_text: string;
  content_fingerprint: string;
  data_quality: DataQualityIssue[];
  semantic_similarity?: string | number;
};

function mapCandidate(row: CandidateRow): Candidate {
  return {
    candidateId: row.candidate_id,
    headline: row.headline,
    skills: row.skills,
    experienceYears: row.experience_years === null ? null : Number(row.experience_years),
    pastRoles: row.past_roles ?? "",
    certifications: row.certifications,
    education: row.education,
    projects: row.projects,
    extraCurriculars: row.extra_curriculars,
    location: row.location,
    normalizedLocation: row.normalized_location,
    noticePeriod: row.notice_period,
    noticeDays: row.notice_days,
    profileText: row.profile_text,
    contentFingerprint: row.content_fingerprint,
    dataQuality: row.data_quality ?? [],
    semanticSimilarity:
      row.semantic_similarity === undefined ? undefined : Number(row.semantic_similarity)
  };
}

@Service([DatabaseService])
export class CandidateRepository {
  constructor(private readonly database: DatabaseService) {}

  async findSemanticMatches(embedding: number[], limit = 80): Promise<Candidate[]> {
    const result = await this.database.query<CandidateRow>(
      `SELECT candidate_id, headline, skills, experience_years, past_roles,
        certifications, education, projects, extra_curriculars, location,
        normalized_location, notice_period, notice_days, profile_text,
        content_fingerprint, data_quality,
        GREATEST(0, LEAST(1, 1 - (embedding <=> $1::vector))) AS semantic_similarity
      FROM candidates
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
      [vectorLiteral(embedding), limit]
    );

    const byFingerprint = new Map<string, Candidate>();
    for (const row of result.rows) {
      const candidate = mapCandidate(row);
      const existing = byFingerprint.get(candidate.contentFingerprint);
      if (existing) {
        existing.duplicateIds = [...(existing.duplicateIds ?? []), candidate.candidateId];
      } else {
        byFingerprint.set(candidate.contentFingerprint, candidate);
      }
    }
    return [...byFingerprint.values()];
  }

  async upsert(input: Candidate & { sourceCandidateId: string | null; embedding: number[] }): Promise<void> {
    await this.database.query(
      `INSERT INTO candidates (
        candidate_id, source_candidate_id, headline, skills, experience_years,
        past_roles, certifications, education, projects, extra_curriculars,
        location, normalized_location, notice_period, notice_days, profile_text,
        content_fingerprint, data_quality, embedding, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::vector,NOW())
      ON CONFLICT (candidate_id) DO UPDATE SET
        source_candidate_id = EXCLUDED.source_candidate_id,
        headline = EXCLUDED.headline,
        skills = EXCLUDED.skills,
        experience_years = EXCLUDED.experience_years,
        past_roles = EXCLUDED.past_roles,
        certifications = EXCLUDED.certifications,
        education = EXCLUDED.education,
        projects = EXCLUDED.projects,
        extra_curriculars = EXCLUDED.extra_curriculars,
        location = EXCLUDED.location,
        normalized_location = EXCLUDED.normalized_location,
        notice_period = EXCLUDED.notice_period,
        notice_days = EXCLUDED.notice_days,
        profile_text = EXCLUDED.profile_text,
        content_fingerprint = EXCLUDED.content_fingerprint,
        data_quality = EXCLUDED.data_quality,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()`,
      [
        input.candidateId,
        input.sourceCandidateId,
        input.headline,
        input.skills,
        input.experienceYears,
        input.pastRoles || null,
        input.certifications,
        input.education,
        input.projects,
        input.extraCurriculars,
        input.location,
        input.normalizedLocation,
        input.noticePeriod,
        input.noticeDays,
        input.profileText,
        input.contentFingerprint,
        JSON.stringify(input.dataQuality),
        vectorLiteral(input.embedding)
      ]
    );
  }

  async counts(): Promise<{ total: number; uniqueProfiles: number }> {
    const result = await this.database.query<{ total: string; unique_profiles: string }>(
      "SELECT COUNT(*) AS total, COUNT(DISTINCT content_fingerprint) AS unique_profiles FROM candidates"
    );
    return {
      total: Number(result.rows[0]?.total ?? 0),
      uniqueProfiles: Number(result.rows[0]?.unique_profiles ?? 0)
    };
  }
}

