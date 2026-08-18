import { describe, expect, it } from "vitest";
import {
  cleanOptional,
  findDataQualityIssues,
  fingerprint,
  normalizeLocation,
  parseExperience,
  parseExperienceRange,
  parseNoticeDays
} from "../src/utils/normalization.js";

describe("candidate data normalization", () => {
  it("normalizes missing values and common location inconsistencies", () => {
    expect(cleanOptional(" - ")).toBeNull();
    expect(normalizeLocation("Alexandria,Egypt")).toBe("alexandria, egypt");
  });

  it("parses experience and notice-period variants conservatively", () => {
    expect(parseExperience("five years")).toBe(5);
    expect(parseExperience("-2")).toBeNull();
    expect(parseNoticeDays("2 weeks notice")).toBe(14);
    expect(parseNoticeDays("Available immediately")).toBe(0);
    expect(parseNoticeDays("Negotiable")).toBeNull();
    expect(parseExperienceRange("3-6 years")).toEqual([3, 6]);
  });

  it("surfaces unreliable records instead of silently repairing them", () => {
    const issues = findDataQualityIssues({
      candidateId: null,
      skills: [],
      experienceRaw: "-2",
      pastRoles: null,
      education: "B.Sc. (2020-2015)",
      location: null,
      noticePeriod: null
    });
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "generated_id",
      "missing_skills",
      "invalid_experience",
      "education_dates"
    ]));
  });

  it("uses punctuation-insensitive, order-stable duplicate fingerprints", () => {
    const first = fingerprint([
      "Data analyst ",
      ["SQL", "Python"],
      "Beirut, Lebanon",
      "2 weeks notice"
    ]);
    const second = fingerprint([
      "data analyst",
      ["python", "sql"],
      "Beirut,Lebanon",
      "2-weeks notice"
    ]);
    expect(second).toBe(first);
  });
});
