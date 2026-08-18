import { Service } from "@freshgum/typedi";
import { DatabaseService } from "../infrastructure/database/database.service.js";
import type { Role } from "../domain/types.js";

type RoleRow = {
  role_id: string;
  title: string;
  department: string;
  required_skills: string[];
  nice_to_have_skills: string[];
  experience_min: number;
  experience_max: number;
  seniority: string;
  location: string;
};

function mapRole(row: RoleRow): Role {
  return {
    roleId: row.role_id,
    title: row.title,
    department: row.department,
    requiredSkills: row.required_skills,
    niceToHaveSkills: row.nice_to_have_skills,
    experienceMin: row.experience_min,
    experienceMax: row.experience_max,
    seniority: row.seniority,
    location: row.location
  };
}

@Service([DatabaseService])
export class RoleRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<Role[]> {
    const result = await this.database.query<RoleRow>(
      "SELECT role_id, title, department, required_skills, nice_to_have_skills, experience_min, experience_max, seniority, location FROM roles ORDER BY role_id"
    );
    return result.rows.map(mapRole);
  }

  async findById(roleId: string): Promise<Role | null> {
    const result = await this.database.query<RoleRow>(
      "SELECT role_id, title, department, required_skills, nice_to_have_skills, experience_min, experience_max, seniority, location FROM roles WHERE role_id = $1",
      [roleId]
    );
    return result.rows[0] ? mapRole(result.rows[0]) : null;
  }

  async upsert(role: Role): Promise<void> {
    await this.database.query(
      `INSERT INTO roles (
        role_id, title, department, required_skills, nice_to_have_skills,
        experience_min, experience_max, seniority, location, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (role_id) DO UPDATE SET
        title = EXCLUDED.title,
        department = EXCLUDED.department,
        required_skills = EXCLUDED.required_skills,
        nice_to_have_skills = EXCLUDED.nice_to_have_skills,
        experience_min = EXCLUDED.experience_min,
        experience_max = EXCLUDED.experience_max,
        seniority = EXCLUDED.seniority,
        location = EXCLUDED.location,
        updated_at = NOW()`,
      [
        role.roleId,
        role.title,
        role.department,
        role.requiredSkills,
        role.niceToHaveSkills,
        role.experienceMin,
        role.experienceMax,
        role.seniority,
        role.location
      ]
    );
  }
}

