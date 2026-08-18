import { createHash } from "node:crypto";
import type { DataQualityIssue } from "../domain/types.js";

const EMPTY_VALUES = new Set(["", "-", "n/a", "na", "none", "null", "unknown"]);

export function cleanOptional(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return EMPTY_VALUES.has(text.toLowerCase()) ? null : text;
}

export function splitList(value: unknown): string[] {
  const cleaned = cleanOptional(value);
  if (!cleaned) return [];
  return cleaned
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeLocation(value: unknown): string | null {
  const cleaned = cleanOptional(value);
  if (!cleaned) return null;
  return cleaned
    .toLowerCase()
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNoticeDays(value: unknown): number | null {
  const cleaned = cleanOptional(value)?.toLowerCase();
  if (!cleaned || cleaned === "negotiable" || cleaned.includes("starts in")) return null;
  if (cleaned === "immediate" || cleaned === "available immediately") return 0;
  const match = cleaned.match(/(\d+)\s*(day|days|week|weeks|month|months)/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit.startsWith("week")) return amount * 7;
  if (unit.startsWith("month")) return amount * 30;
  return amount;
}

export function parseExperience(value: unknown): number | null {
  const cleaned = cleanOptional(value)?.toLowerCase();
  if (!cleaned) return null;
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };
  const number = Number.parseFloat(cleaned);
  const parsed = Number.isFinite(number) ? number : words[cleaned.split(/\s+/)[0]];
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function fingerprint(values: unknown[]): string {
  const normalizeFingerprintValue = (value: unknown): string => {
    if (Array.isArray(value)) {
      return value.map(normalizeFingerprintValue).sort().join(" ");
    }
    return String(value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  };
  const normalized = values
    .map(normalizeFingerprintValue)
    .join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function findDataQualityIssues(input: {
  candidateId: string | null;
  skills: string[];
  experienceRaw: unknown;
  pastRoles: string | null;
  education: string | null;
  location: string | null;
  noticePeriod: string | null;
}): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (!input.candidateId) {
    issues.push({ code: "generated_id", message: "Source profile had no candidate ID", severity: "high" });
  }
  if (input.skills.length === 0) {
    issues.push({ code: "missing_skills", message: "Skills were not provided", severity: "high" });
  }
  if (parseExperience(input.experienceRaw) === null) {
    issues.push({ code: "invalid_experience", message: "Experience could not be reliably parsed", severity: "high" });
  }
  if (!input.pastRoles) {
    issues.push({ code: "missing_roles", message: "Past-role evidence was not provided", severity: "medium" });
  }
  if (!input.location) {
    issues.push({ code: "missing_location", message: "Location was not provided", severity: "medium" });
  }
  if (!input.noticePeriod) {
    issues.push({ code: "missing_notice", message: "Availability was not provided", severity: "medium" });
  }
  if (input.education) {
    const ranges = [...input.education.matchAll(/\((\d{4})[–-](\d{4})\)/g)];
    if (ranges.some((match) => Number(match[1]) > Number(match[2]))) {
      issues.push({ code: "education_dates", message: "Education dates appear reversed", severity: "low" });
    }
  }
  return issues;
}

export function parseExperienceRange(value: string): [number, number] {
  const values = value.match(/\d+/g)?.map(Number) ?? [];
  return [values[0] ?? 0, values[1] ?? values[0] ?? 99];
}
