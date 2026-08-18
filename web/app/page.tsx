"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type {
  GuidanceMode,
  GuidanceOverrides,
  Guidance,
  MatchResponse,
  Meta,
  RankedCandidate,
  Role,
} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const GUIDANCE_EXAMPLES = [
  "Prioritize candidates available immediately",
  "We value client-facing experience over years of experience",
  "Must be available within 30 days and prioritize Arabic fluency",
];

const BREAKDOWN_LABELS: Record<string, string> = {
  requiredSkills: "Required skills",
  evidence: "Role evidence",
  experience: "Experience",
  preferredSkills: "Preferred skills",
  roleLocation: "Role location",
  recruiterGuidance: "Recruiter priorities",
};

const MATCH_PROGRESS_STAGES = [
  {
    startsAtPercent: 0,
    label: "Interpret guidance",
    detail: "Turning recruiter language into required and preferred criteria.",
  },
  {
    startsAtPercent: 24,
    label: "Retrieve profiles",
    detail:
      "Embedding the search and querying candidate profiles with pgvector.",
  },
  {
    startsAtPercent: 48,
    label: "Score the evidence",
    detail:
      "Deduplicating profiles and calculating deterministic role-fit scores.",
  },
  {
    startsAtPercent: 70,
    label: "Explain the ranking",
    detail:
      "Writing evidence-grounded summaries, gaps, and interview questions.",
  },
  {
    startsAtPercent: 90,
    label: "Save the shortlist",
    detail:
      "Persisting the ranked result so it is ready for recruiter approval.",
  },
] as const;

type MatchProgress = {
  percent: number;
  stageIndex: number;
  label: string;
  detail: string;
  elapsedSeconds: number;
  complete: boolean;
};

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function normalizeGuidance(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function formatScore(value: number): string {
  return value.toFixed(1);
}

function createMatchProgress(
  percent: number,
  elapsedMs: number,
): MatchProgress {
  const stageIndex = Math.max(
    0,
    MATCH_PROGRESS_STAGES.findLastIndex(
      (stage) => percent >= stage.startsAtPercent,
    ),
  );
  const stage = MATCH_PROGRESS_STAGES[stageIndex];
  return {
    percent,
    stageIndex,
    label: stage.label,
    detail: stage.detail,
    elapsedSeconds: Math.floor(elapsedMs / 1_000),
    complete: false,
  };
}

function randomProgressIncrement(percent: number): number {
  if (percent < 24) return 4 + Math.random() * 5;
  if (percent < 48) return 2.5 + Math.random() * 4;
  if (percent < 70) return 1.5 + Math.random() * 3;
  if (percent < 88) return 0.7 + Math.random() * 1.8;
  return 0.2 + Math.random() * 0.8;
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function overrideSignature(overrides: GuidanceOverrides): string {
  return JSON.stringify({
    locationMode: overrides.locationMode ?? null,
    availabilityMode: overrides.availabilityMode ?? null,
    experienceMode: overrides.experienceMode ?? null,
    termModes: Object.fromEntries(
      Object.entries(overrides.termModes ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  });
}

function availabilityLabel(days: number): string {
  return days === 0
    ? "Immediate availability"
    : `Available within ${days} days`;
}

function locationCriterionLabel(guidance: Guidance): string {
  if (!guidance.location) return "";
  const values = guidance.location.values.join(" or ");
  return guidance.location.excluded ? `Outside ${values}` : values;
}

function experienceCriterionLabel(guidance: Guidance): string {
  if (!guidance.experience) return "";
  const { minYears, maxYears } = guidance.experience;
  if (minYears !== null && maxYears !== null) {
    return `${minYears}-${maxYears} years experience`;
  }
  if (minYears !== null) return `${minYears}+ years experience`;
  return `Up to ${maxYears} years experience`;
}

function displayedGuidanceSummary(
  guidance: Guidance,
  overrides: GuidanceOverrides,
): string {
  const required: string[] = [];
  const preferred: string[] = [];
  const locationMode = overrides.locationMode ?? guidance.location?.mode;
  const availabilityMode =
    overrides.availabilityMode ?? guidance.availability?.mode;
  const experienceMode = overrides.experienceMode ?? guidance.experience?.mode;

  if (guidance.location && locationMode) {
    (locationMode === "required" ? required : preferred).push(
      guidance.location.excluded
        ? `candidates outside ${guidance.location.values.join(" or ")}`
        : `${guidance.location.values.join(" or ")}-based candidates`,
    );
  }
  if (guidance.availability && availabilityMode) {
    (availabilityMode === "required" ? required : preferred).push(
      guidance.availability.value === 0
        ? "immediate availability"
        : `availability within ${guidance.availability.value} days`,
    );
  }
  if (guidance.experience && experienceMode) {
    (experienceMode === "required" ? required : preferred).push(
      experienceCriterionLabel(guidance).toLowerCase(),
    );
  }
  for (const term of guidance.terms) {
    const mode = overrides.termModes?.[term.value] ?? term.mode;
    (mode === "required" ? required : preferred).push(
      term.excluded ? `without ${term.value}` : term.value,
    );
  }

  const parts = [
    required.length ? `Require ${required.join(" and ")}` : null,
    preferred.length ? `Prefer ${preferred.join(", ")}` : null,
    guidance.experienceWeightDelta < 0
      ? "reduce emphasis on years of experience"
      : null,
    guidance.experienceWeightDelta > 0
      ? "increase emphasis on years of experience"
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length ? `${parts.join("; ")}.` : "Default role rubric";
}

export default function Home() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [roleId, setRoleId] = useState("R004");
  const [guidance, setGuidance] = useState("");
  const [guidanceOverrides, setGuidanceOverrides] = useState<GuidanceOverrides>(
    {},
  );
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(
    null,
  );
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState<MatchProgress | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastRunInput, setLastRunInput] = useState<{
    roleId: string;
    guidance: string;
    overrides: string;
  } | null>(null);
  const approveButtonRef = useRef<HTMLButtonElement>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/roles`).then(async (response) => {
        if (!response.ok) throw new Error("Could not load roles.");
        return response.json() as Promise<{ roles: Role[] }>;
      }),
      fetch(`${API_URL}/api/meta`).then(async (response) => {
        if (!response.ok) throw new Error("Could not load system status.");
        return response.json() as Promise<Meta>;
      }),
    ])
      .then(([roleData, metaData]) => {
        setRoles(roleData.roles);
        setMeta(metaData);
        if (!roleData.roles.some((role) => role.roleId === roleId)) {
          setRoleId(roleData.roles[0]?.roleId ?? "");
        }
      })
      .catch((loadError) => setError(formatError(loadError)));
  }, []);

  useEffect(
    () => () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    },
    [],
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.roleId === roleId) ?? null,
    [roles, roleId],
  );
  const activeCandidate = useMemo(
    () =>
      result?.candidates.find(
        (candidate) => candidate.candidateId === activeCandidateId,
      ) ??
      result?.candidates[0] ??
      null,
    [result, activeCandidateId],
  );
  const resultsAreStale = Boolean(
    result &&
    lastRunInput &&
    (lastRunInput.roleId !== roleId ||
      lastRunInput.guidance !== normalizeGuidance(guidance) ||
      lastRunInput.overrides !== overrideSignature(guidanceOverrides)),
  );

  useEffect(() => {
    if (!resultsAreStale) return;
    setSelectedCandidateIds([]);
    setMarkdown(null);
  }, [resultsAreStale]);

  function startMatchProgress() {
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    const startedAt = Date.now();
    const initialPercent = 7 + Math.floor(Math.random() * 4);
    setMatchProgress(createMatchProgress(initialPercent, 0));

    const scheduleNextBurst = (first = false) => {
      const delay = first
        ? 260 + Math.random() * 280
        : 430 + Math.random() * 760;
      progressTimerRef.current = setTimeout(() => {
        setMatchProgress((current) => {
          if (!current || current.complete) return current;
          const nextPercent = Math.min(
            96,
            Math.round(
              current.percent + randomProgressIncrement(current.percent),
            ),
          );
          return createMatchProgress(nextPercent, Date.now() - startedAt);
        });
        scheduleNextBurst();
      }, delay);
    };

    scheduleNextBurst(true);
  }

  function completeMatchProgress() {
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = null;
    setMatchProgress((current) => ({
      percent: 100,
      stageIndex: MATCH_PROGRESS_STAGES.length,
      label: "Shortlist ready",
      detail: "The ranking, evidence, and recruiter brief are ready to review.",
      elapsedSeconds: current?.elapsedSeconds ?? 0,
      complete: true,
    }));
  }

  function stopMatchProgress() {
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = null;
    setMatchProgress(null);
  }

  async function runMatch() {
    if (!roleId) return;
    const requestInput = { roleId, guidance, guidanceOverrides };
    setLoading(true);
    setMatching(true);
    startMatchProgress();
    setError(null);
    setMarkdown(null);
    try {
      const response = await fetch(`${API_URL}/api/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestInput, limit: 5 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Matching failed.");
      const nextResult = payload as MatchResponse;
      const resolvedOverrides: GuidanceOverrides = {
        ...(nextResult.guidance.location
          ? { locationMode: nextResult.guidance.location.mode }
          : {}),
        ...(nextResult.guidance.availability
          ? { availabilityMode: nextResult.guidance.availability.mode }
          : {}),
        ...(nextResult.guidance.experience
          ? { experienceMode: nextResult.guidance.experience.mode }
          : {}),
        ...(nextResult.guidance.terms.length
          ? {
              termModes: Object.fromEntries(
                nextResult.guidance.terms.map((term) => [
                  term.value,
                  term.mode,
                ]),
              ),
            }
          : {}),
      };
      completeMatchProgress();
      await new Promise((resolve) => window.setTimeout(resolve, 520));
      setResult(nextResult);
      setGuidanceOverrides(resolvedOverrides);
      setLastRunInput({
        roleId: requestInput.roleId,
        guidance: normalizeGuidance(requestInput.guidance),
        overrides: overrideSignature(resolvedOverrides),
      });
      setActiveCandidateId(nextResult.candidates[0]?.candidateId ?? null);
      setSelectedCandidateIds([]);
    } catch (matchError) {
      setError(formatError(matchError));
    } finally {
      stopMatchProgress();
      setMatching(false);
      setLoading(false);
    }
  }

  async function approveSelection() {
    if (!result || resultsAreStale || selectedCandidateIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/api/matches/${result.runId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateIds: selectedCandidateIds }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not create the brief.");
      setMarkdown(payload.markdown);
    } catch (approvalError) {
      setError(formatError(approvalError));
    } finally {
      setLoading(false);
    }
  }

  function toggleCandidate(candidateId: string) {
    if (resultsAreStale) return;
    setSelectedCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((item) => item !== candidateId)
        : [...current, candidateId],
    );
  }

  async function copyMarkdown() {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadMarkdown() {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tasc-hiring-brief-${result?.role.roleId ?? "candidate"}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">
            TA<span>SC</span>
          </span>
          <span className="brand-divider" />
          <span className="product-name">Recruiter intelligence </span>
        </div>
        <div className="system-status" aria-label="System status">
          <span className="status-dot live" />
          <span>Total {meta?.candidateCount ?? "..."} profiles in DB</span>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="setup-pane">
          <div className="step-index">01 / Define the search</div>
          <label className="field-label" htmlFor="role-select">
            Open role
          </label>
          <div className="select-wrap">
            <select
              id="role-select"
              value={roleId}
              disabled={loading}
              onChange={(event) => {
                setRoleId(event.target.value);
                setGuidanceOverrides({});
                setResult(null);
                setLastRunInput(null);
                setActiveCandidateId(null);
                setSelectedCandidateIds([]);
                setMarkdown(null);
              }}
            >
              {roles.map((role) => (
                <option key={role.roleId} value={role.roleId}>
                  {role.title}
                </option>
              ))}
            </select>
            <span aria-hidden="true">⌄</span>
          </div>

          {selectedRole && (
            <motion.div
              key={selectedRole.roleId}
              className="role-brief"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="role-id">{selectedRole.roleId}</div>
              <h1>{selectedRole.title}</h1>
              <p>
                {selectedRole.department} · {selectedRole.seniority} ·{" "}
                {selectedRole.location}
              </p>
              <div className="requirement-list">
                <span>Required evidence</span>
                {selectedRole.requiredSkills.map((skill) => (
                  <em key={skill}>{skill}</em>
                ))}
              </div>
            </motion.div>
          )}

          <div className="guidance-block">
            <label className="field-label" htmlFor="guidance">
              Recruiter guidance <i>optional</i>
            </label>
            <textarea
              id="guidance"
              value={guidance}
              disabled={loading}
              onChange={(event) => {
                setGuidance(event.target.value);
                setGuidanceOverrides({});
              }}
              placeholder="Tell the agent what matters for this search…"
              maxLength={800}
            />
            <div className="example-prompts">
              {GUIDANCE_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setGuidance(example);
                    setGuidanceOverrides({});
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <button
            className="run-button"
            type="button"
            onClick={runMatch}
            disabled={loading || !roleId}
          >
            <span>
              {matching
                ? `Matching ${matchProgress?.percent ?? 0}%`
                : loading
                  ? "Preparing brief"
                  : "Run candidate match"}
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </aside>

        <section className="results-pane">
          <div className="results-scroll">
            <div className="results-heading">
              <div>
                <div className="step-index">02 / Review the evidence</div>
                <h2>{result ? "Ranked shortlist" : "Candidate shortlist"}</h2>
              </div>
              {result && (
                <div className="run-summary">
                  <span>
                    {result.totalConsidered} unique profiles considered
                  </span>
                  <span>{result.duplicatesHidden} duplicates hidden</span>
                </div>
              )}
            </div>

            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}

            {matching && matchProgress && (
              <MatchProgressPanel
                progress={matchProgress}
                compact={Boolean(result)}
              />
            )}

            {resultsAreStale && !matching && (
              <motion.div
                className="stale-results"
                role="status"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div>
                  <strong>Results are out of date</strong>
                  <span>
                    Recruiter guidance changed after this shortlist was
                    generated.
                  </span>
                </div>
                <button type="button" onClick={runMatch} disabled={loading}>
                  {loading ? "Updating…" : "Run updated match"}
                </button>
              </motion.div>
            )}

            {!result && !loading && (
              <motion.div
                className="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="empty-orbit" aria-hidden="true">
                  <span>120</span>
                </div>
                <h3>Ready to compare evidence</h3>
                <p>
                  Select a role, add any recruiter priorities, and run the
                  match. The system will retrieve, deduplicate, score, and
                  explain the strongest profiles.
                </p>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {result && (
                <motion.div
                  className="candidate-list"
                  key={result.runId}
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: { transition: { staggerChildren: 0.06 } },
                  }}
                >
                  <div className="interpreted-guidance">
                    <span>Rubric</span>
                    <div className="rubric-copy">
                      <strong>
                        {displayedGuidanceSummary(
                          result.guidance,
                          guidanceOverrides,
                        )}
                      </strong>
                      {(result.guidance.location ||
                        result.guidance.availability ||
                        result.guidance.experience ||
                        result.guidance.terms.length > 0) && (
                        <div
                          className="criterion-controls"
                          aria-label="Recruiter criterion importance"
                        >
                          {result.guidance.location && (
                            <CriterionControl
                              label={locationCriterionLabel(result.guidance)}
                              mode={
                                guidanceOverrides.locationMode ??
                                result.guidance.location.mode
                              }
                              disabled={loading}
                              onChange={(mode) =>
                                setGuidanceOverrides((current) => ({
                                  ...current,
                                  locationMode: mode,
                                }))
                              }
                            />
                          )}
                          {result.guidance.availability && (
                            <CriterionControl
                              label={availabilityLabel(
                                result.guidance.availability.value,
                              )}
                              mode={
                                guidanceOverrides.availabilityMode ??
                                result.guidance.availability.mode
                              }
                              disabled={loading}
                              onChange={(mode) =>
                                setGuidanceOverrides((current) => ({
                                  ...current,
                                  availabilityMode: mode,
                                }))
                              }
                            />
                          )}
                          {result.guidance.experience && (
                            <CriterionControl
                              label={experienceCriterionLabel(result.guidance)}
                              mode={
                                guidanceOverrides.experienceMode ??
                                result.guidance.experience.mode
                              }
                              disabled={loading}
                              onChange={(mode) =>
                                setGuidanceOverrides((current) => ({
                                  ...current,
                                  experienceMode: mode,
                                }))
                              }
                            />
                          )}
                          {result.guidance.terms.map((term) => (
                            <CriterionControl
                              key={`${term.excluded ? "without" : "with"}-${term.value}`}
                              label={term.excluded ? `Without ${term.value}` : term.value}
                              mode={
                                guidanceOverrides.termModes?.[term.value] ??
                                term.mode
                              }
                              disabled={loading}
                              onChange={(mode) =>
                                setGuidanceOverrides((current) => ({
                                  ...current,
                                  termModes: {
                                    ...(current.termModes ?? {}),
                                    [term.value]: mode,
                                  },
                                }))
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <i>
                      {result.guidance.interpretedBy === "hybrid"
                        ? "AI + rules"
                        : "Rule interpreted"}
                    </i>
                  </div>
                  {result.candidates.length < result.requestedLimit && (
                    <div className="constraint-summary" role="status">
                      <strong>
                        {result.candidates.length} {result.candidates.length === 1
                          ? "candidate met"
                          : "candidates met"} the mandatory, role-fit, and
                        minimum-experience thresholds.
                      </strong>
                      <span>
                        {result.belowMinimumExperienceCount > 0
                          ? `${result.belowMinimumExperienceCount} otherwise relevant ${result.belowMinimumExperienceCount === 1 ? "profile was" : "profiles were"} excluded because the stated experience was below the ${result.minimumExperienceYears}-year minimum.`
                          : [
                              ...result.appliedConstraints,
                              "Minimum role relevance",
                              `Minimum experience: ${result.minimumExperienceYears} years`,
                            ].join(" · ")}
                      </span>
                    </div>
                  )}
                  {result.candidates.length === 0 && (
                    <div className="no-qualified-results">
                      <strong>No defensible shortlist for this rubric</strong>
                      <span>
                        {result.belowMinimumExperienceCount > 0
                          ? `${result.belowMinimumExperienceCount} otherwise relevant ${result.belowMinimumExperienceCount === 1 ? "profile falls" : "profiles fall"} below the ${result.minimumExperienceYears}-year minimum.`
                          : "Relax a required criterion or review the source profiles, then run the match again."}
                      </span>
                    </div>
                  )}
                  {result.candidates.map((candidate) => (
                    <CandidateRow
                      key={candidate.candidateId}
                      candidate={candidate}
                      active={
                        activeCandidate?.candidateId === candidate.candidateId
                      }
                      selected={selectedCandidateIds.includes(
                        candidate.candidateId,
                      )}
                      disabled={resultsAreStale || matching}
                      onOpen={() => setActiveCandidateId(candidate.candidateId)}
                      onToggle={() => toggleCandidate(candidate.candidateId)}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {result && (
            <div className="approval-bar">
              <div>
                <strong>{selectedCandidateIds.length}</strong>
                <span>selected</span>
              </div>
              <button
                ref={approveButtonRef}
                type="button"
                onClick={approveSelection}
                disabled={
                  loading ||
                  resultsAreStale ||
                  selectedCandidateIds.length === 0
                }
              >
                Approve & create brief <span>↗</span>
              </button>
            </div>
          )}
        </section>

        <aside className="inspector-pane">
          <div className="step-index">03 / Close the gaps</div>
          <AnimatePresence mode="wait">
            {activeCandidate ? (
              <motion.div
                key={activeCandidate.candidateId}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                <div className="inspector-header">
                  <div className="candidate-monogram">
                    {activeCandidate.candidateId
                      .replace(/[^0-9]/g, "")
                      .slice(-2) || "AI"}
                  </div>
                  <div>
                    <span>{activeCandidate.candidateId}</span>
                    <h2>{activeCandidate.headline}</h2>
                  </div>
                </div>

                <div className="score-lockup">
                  <div>
                    <strong>{formatScore(activeCandidate.score)}</strong>
                    <span>/100 match</span>
                  </div>
                  <div>
                    <strong>{activeCandidate.confidence}%</strong>
                    <span>evidence confidence</span>
                  </div>
                </div>

                <div className="score-axis" aria-label="Score axes">
                  <div>
                    <span>Technical role fit</span>
                    <strong>{formatScore(activeCandidate.roleFitScore)}</strong>
                  </div>
                  <div>
                    <span>Recruiter priorities</span>
                    <strong>
                      {activeCandidate.preferenceScore === null
                        ? "Not applied"
                        : formatScore(activeCandidate.preferenceScore)}
                    </strong>
                  </div>
                </div>

                <section className="inspector-section">
                  <h3>Why this candidate</h3>
                  <p>{activeCandidate.whyFit}</p>
                </section>

                <section className="inspector-section">
                  <h3>Score composition</h3>
                  <div className="breakdown-list">
                    {Object.entries(activeCandidate.scoreBreakdown).map(
                      ([key, value]) => (
                        <div key={key}>
                          <span>{BREAKDOWN_LABELS[key] ?? key}</span>
                          <div>
                            <motion.i
                              initial={{ width: 0 }}
                              animate={{
                                width: `${Math.min(100, value * 3)}%`,
                              }}
                            />
                          </div>
                          <b>{formatScore(value)}</b>
                        </div>
                      ),
                    )}
                  </div>
                </section>

                <section className="inspector-section">
                  <h3>Evidence & gaps</h3>
                  <div className="evidence-tags">
                    {activeCandidate.matchedRequiredSkills.map((skill) => (
                      <span key={skill}>✓ {skill}</span>
                    ))}
                    {activeCandidate.matchedGuidanceTerms.map((term) => (
                      <span key={`guidance-${term}`}>✓ {term}</span>
                    ))}
                  </div>
                  <ul className="gap-list">
                    {activeCandidate.gaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                </section>

                <section className="inspector-section questions-section">
                  <h3>Questions to ask</h3>
                  <ol>
                    {activeCandidate.clarifyingQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ol>
                </section>

                {(activeCandidate.dataQuality.length > 0 ||
                  activeCandidate.duplicateIds?.length) && (
                  <section className="quality-note">
                    <strong>Evidence notes</strong>
                    {activeCandidate.dataQuality.map((issue) => (
                      <span key={issue.code}>{issue.message}</span>
                    ))}
                    {activeCandidate.duplicateIds?.length ? (
                      <span>
                        Duplicate profile hidden:{" "}
                        {activeCandidate.duplicateIds.join(", ")}
                      </span>
                    ) : null}
                  </section>
                )}
              </motion.div>
            ) : (
              <div className="inspector-empty">
                <span>Candidate evidence will appear here after matching.</span>
              </div>
            )}
          </AnimatePresence>
        </aside>
      </div>

      <AnimatePresence>
        {markdown && (
          <BriefDialog
            key="hiring-manager-brief"
            markdown={markdown}
            copied={copied}
            returnFocusRef={approveButtonRef}
            onClose={() => setMarkdown(null)}
            onCopy={copyMarkdown}
            onDownload={downloadMarkdown}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function MatchProgressPanel({
  progress,
  compact,
}: {
  progress: MatchProgress;
  compact: boolean;
}) {
  return (
    <motion.section
      className={`match-progress ${compact ? "compact" : ""}`}
      aria-live="polite"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="progress-kicker">
        <span>Estimated progress</span>
        <span>{formatElapsed(progress.elapsedSeconds)} elapsed</span>
      </div>
      <div className="progress-current">
        <AnimatePresence mode="wait">
          <motion.div
            key={progress.label}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            <strong>{progress.label}</strong>
            <span>{progress.detail}</span>
          </motion.div>
        </AnimatePresence>
        <b>{progress.percent}%</b>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Candidate matching progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <motion.i
          animate={{ width: `${progress.percent}%` }}
          transition={{
            duration: progress.complete ? 0.28 : 0.4,
            ease: "easeOut",
          }}
        />
      </div>
      <ol className="progress-stages">
        {MATCH_PROGRESS_STAGES.map((stage, index) => {
          const state =
            progress.complete || index < progress.stageIndex
              ? "done"
              : index === progress.stageIndex
                ? "current"
                : "upcoming";
          return (
            <li key={stage.label} className={state}>
              <span>
                {progress.complete || index < progress.stageIndex
                  ? "✓"
                  : String(index + 1).padStart(2, "0")}
              </span>
              <b>{stage.label}</b>
            </li>
          );
        })}
      </ol>
      <p>
        Progress is estimated from the matching pipeline and pauses below 100%
        until the server confirms completion.
      </p>
    </motion.section>
  );
}

function CriterionControl({
  label,
  mode,
  disabled,
  onChange,
}: {
  label: string;
  mode: GuidanceMode;
  disabled: boolean;
  onChange: (mode: GuidanceMode) => void;
}) {
  const nextMode: GuidanceMode = mode === "required" ? "preferred" : "required";
  return (
    <button
      className={`criterion-control ${mode}`}
      type="button"
      disabled={disabled}
      aria-label={`${label} is ${mode}. Change to ${nextMode}.`}
      onClick={() => onChange(nextMode)}
    >
      <span>{label}</span>
      <b>{mode}</b>
    </button>
  );
}

function BriefDialog({
  markdown,
  copied,
  returnFocusRef,
  onClose,
  onCopy,
  onDownload,
}: {
  markdown: string;
  copied: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function closeDialog() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  }

  return (
    <motion.dialog
      ref={dialogRef}
      className="markdown-modal"
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      aria-labelledby="brief-title"
      aria-describedby="brief-description"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClose={() => {
        onClose();
        window.requestAnimationFrame(() => returnFocusRef.current?.focus());
      }}
    >
      <p id="brief-description" className="sr-only">
        Review, copy, or download the approved candidate shortlist.
      </p>
      <div className="modal-heading">
        <div>
          <span>Approved shortlist</span>
          <h2 id="brief-title">Hiring manager brief</h2>
        </div>
        <button
          type="button"
          onClick={closeDialog}
          aria-label="Close brief"
          autoFocus
        >
          ×
        </button>
      </div>
      <pre>{markdown}</pre>
      <div className="modal-actions">
        <button type="button" onClick={onCopy}>
          {copied ? "Copied" : "Copy Markdown"}
        </button>
        <button type="button" className="primary" onClick={onDownload}>
          Download .md
        </button>
      </div>
    </motion.dialog>
  );
}

function CandidateRow({
  candidate,
  active,
  selected,
  disabled,
  onOpen,
  onToggle,
}: {
  candidate: RankedCandidate;
  active: boolean;
  selected: boolean;
  disabled: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <motion.article
      className={`candidate-row ${active ? "active" : ""}`}
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0 },
      }}
      layout
    >
      <button
        className="row-select"
        type="button"
        onClick={onToggle}
        aria-label={`${selected ? "Remove" : "Select"} ${candidate.candidateId}`}
        disabled={disabled}
      >
        <span className={selected ? "checked" : ""}>{selected ? "✓" : ""}</span>
      </button>
      <button className="row-main" type="button" onClick={onOpen}>
        <span className="rank">{String(candidate.rank).padStart(2, "0")}</span>
        <span className="candidate-copy">
          <strong>{candidate.headline}</strong>
          <small>
            {candidate.candidateId} · {candidate.experienceYears ?? "?"} yrs ·{" "}
            {candidate.location ?? "Location unknown"}
          </small>
          <span className="row-skills">
            {candidate.matchedRequiredSkills.slice(0, 3).map((skill) => (
              <i key={skill}>{skill}</i>
            ))}
          </span>
        </span>
        <span className="availability">
          <small>Availability</small>
          <strong>{candidate.noticePeriod ?? "Verify"}</strong>
        </span>
        <span className="row-score">
          <strong>{formatScore(candidate.score)}</strong>
          <small>{candidate.fitBand}</small>
        </span>
      </button>
    </motion.article>
  );
}
