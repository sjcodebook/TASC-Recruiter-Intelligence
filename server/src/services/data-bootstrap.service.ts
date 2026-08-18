import { readFile } from "node:fs/promises";
import path from "node:path";
import { Service } from "@freshgum/typedi";
import { parse } from "csv-parse/sync";
import { CandidateRepository } from "../repositories/candidate.repository.js";
import { RoleRepository } from "../repositories/role.repository.js";
import { OpenAIGateway } from "../infrastructure/openai/openai.gateway.js";
import type { Candidate, Role } from "../domain/types.js";
import {
  cleanOptional,
  findDataQualityIssues,
  fingerprint,
  normalizeLocation,
  parseExperience,
  parseExperienceRange,
  parseNoticeDays,
  splitList
} from "../utils/normalization.js";

type CsvRow = Record<string, string>;

@Service([CandidateRepository, RoleRepository, OpenAIGateway])
export class DataBootstrapService {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly roles: RoleRepository,
    private readonly openai: OpenAIGateway
  ) {}

  async seed(): Promise<{ roles: number; candidates: number }> {
    const dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.resolve(process.cwd(), "../data");
    const [rolesCsv, candidatesCsv] = await Promise.all([
      readFile(path.join(dataDir, "open_roles.csv"), "utf8"),
      readFile(path.join(dataDir, "candidate_profiles.csv"), "utf8")
    ]);
    const roleRows = parse(rolesCsv, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[];
    const candidateRows = parse(candidatesCsv, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[];

    for (const row of roleRows) {
      const [experienceMin, experienceMax] = parseExperienceRange(row.experience_range);
      const role: Role = {
        roleId: row.role_id,
        title: row.title,
        department: row.department,
        requiredSkills: splitList(row.required_skills),
        niceToHaveSkills: splitList(row.nice_to_have_skills),
        experienceMin,
        experienceMax,
        seniority: row.seniority,
        location: row.location
      };
      await this.roles.upsert(role);
    }

    const prepared = candidateRows.map((row, index) => this.prepareCandidate(row, index));
    for (let start = 0; start < prepared.length; start += 64) {
      const batch = prepared.slice(start, start + 64);
      const embeddings = await this.openai.embedMany(batch.map((item) => item.profileText));
      for (let index = 0; index < batch.length; index += 1) {
        await this.candidates.upsert({ ...batch[index], embedding: embeddings[index] });
      }
    }

    return { roles: roleRows.length, candidates: candidateRows.length };
  }

  private prepareCandidate(row: CsvRow, index: number): Candidate & { sourceCandidateId: string | null } {
    const sourceCandidateId = cleanOptional(row.candidate_id);
    const candidateId = sourceCandidateId ?? `C-AUTO-${String(index + 1).padStart(3, "0")}`;
    const skills = splitList(row.skills);
    const experienceYears = parseExperience(row.experience_years);
    const pastRoles = cleanOptional(row.past_roles);
    const certifications = cleanOptional(row.certifications);
    const education = cleanOptional(row.education);
    const projects = cleanOptional(row.projects);
    const extraCurriculars = cleanOptional(row.extra_curriculars);
    const location = cleanOptional(row.location);
    const noticePeriod = cleanOptional(row.notice_period);
    const headline = cleanOptional(row.headline) ?? "Profile information incomplete";
    const profileText = [
      headline,
      `Skills: ${skills.join(", ")}`,
      pastRoles ? `Past roles: ${pastRoles}` : "",
      certifications ? `Certifications: ${certifications}` : "",
      education ? `Education: ${education}` : "",
      projects ? `Projects: ${projects}` : "",
      extraCurriculars ? `Additional evidence: ${extraCurriculars}` : "",
      location ? `Location: ${location}` : ""
    ].filter(Boolean).join("\n");
    const contentFingerprint = fingerprint([
      headline,
      skills,
      experienceYears,
      pastRoles,
      certifications,
      education,
      projects,
      extraCurriculars,
      normalizeLocation(location),
      parseNoticeDays(noticePeriod)
    ]);
    const dataQuality = findDataQualityIssues({
      candidateId: sourceCandidateId,
      skills,
      experienceRaw: row.experience_years,
      pastRoles,
      education,
      location,
      noticePeriod
    });

    return {
      sourceCandidateId,
      candidateId,
      headline,
      skills,
      experienceYears,
      pastRoles: pastRoles ?? "",
      certifications,
      education,
      projects,
      extraCurriculars,
      location,
      normalizedLocation: normalizeLocation(location),
      noticePeriod,
      noticeDays: parseNoticeDays(noticePeriod),
      profileText,
      contentFingerprint,
      dataQuality
    };
  }
}
