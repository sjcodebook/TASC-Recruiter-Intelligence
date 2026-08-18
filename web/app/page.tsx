"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { MatchResponse, Meta, RankedCandidate, Role } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const GUIDANCE_EXAMPLES = [
  "Prioritize candidates available immediately",
  "We value client-facing experience over years of experience",
  "Must be available within 30 days and prioritize Arabic fluency"
];

const BREAKDOWN_LABELS: Record<string, string> = {
  requiredSkills: "Required skills",
  evidence: "Role evidence",
  experience: "Experience",
  preferredSkills: "Preferred skills",
  logistics: "Location & notice",
  recruiterGuidance: "Your guidance"
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

export default function Home() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [roleId, setRoleId] = useState("R004");
  const [guidance, setGuidance] = useState("");
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastRunInput, setLastRunInput] = useState<{ roleId: string; guidance: string } | null>(null);
  const approveButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/roles`).then(async (response) => {
        if (!response.ok) throw new Error("Could not load roles.");
        return response.json() as Promise<{ roles: Role[] }>;
      }),
      fetch(`${API_URL}/api/meta`).then(async (response) => {
        if (!response.ok) throw new Error("Could not load system status.");
        return response.json() as Promise<Meta>;
      })
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

  const selectedRole = useMemo(
    () => roles.find((role) => role.roleId === roleId) ?? null,
    [roles, roleId]
  );
  const activeCandidate = useMemo(
    () => result?.candidates.find((candidate) => candidate.candidateId === activeCandidateId)
      ?? result?.candidates[0]
      ?? null,
    [result, activeCandidateId]
  );
  const resultsAreStale = Boolean(
    result
    && lastRunInput
    && (lastRunInput.roleId !== roleId || lastRunInput.guidance !== normalizeGuidance(guidance))
  );

  useEffect(() => {
    if (!resultsAreStale) return;
    setSelectedCandidateIds([]);
    setMarkdown(null);
  }, [resultsAreStale]);

  async function runMatch() {
    if (!roleId) return;
    const requestInput = { roleId, guidance };
    setLoading(true);
    setError(null);
    setMarkdown(null);
    try {
      const response = await fetch(`${API_URL}/api/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestInput, limit: 5 })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Matching failed.");
      const nextResult = payload as MatchResponse;
      setResult(nextResult);
      setLastRunInput({
        roleId: requestInput.roleId,
        guidance: normalizeGuidance(requestInput.guidance)
      });
      setActiveCandidateId(nextResult.candidates[0]?.candidateId ?? null);
      setSelectedCandidateIds(nextResult.candidates[0] ? [nextResult.candidates[0].candidateId] : []);
    } catch (matchError) {
      setError(formatError(matchError));
    } finally {
      setLoading(false);
    }
  }

  async function approveSelection() {
    if (!result || resultsAreStale || selectedCandidateIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/matches/${result.runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: selectedCandidateIds })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not create the brief.");
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
        : [...current, candidateId]
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
          <span className="brand-mark">TA<span>SC</span></span>
          <span className="brand-divider" />
          <span className="product-name">Match intelligence</span>
        </div>
        <div className="system-status" aria-label="System status">
          <span className={`status-dot ${meta?.aiMode === "openai" ? "live" : "local"}`} />
          <span>{meta?.aiMode === "openai" ? "OpenAI reasoning" : "Local evaluation mode"}</span>
          <span className="status-separator">·</span>
          <span>{meta?.candidateCount ?? "..."} profiles</span>
          <span className="status-separator desktop-only">·</span>
          <span className="desktop-only">pgvector {meta?.pgvectorVersion ?? "..."}</span>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="setup-pane">
          <div className="step-index">01 / Define the search</div>
          <label className="field-label" htmlFor="role-select">Open role</label>
          <div className="select-wrap">
            <select
              id="role-select"
              value={roleId}
              onChange={(event) => {
                setRoleId(event.target.value);
                setResult(null);
                setLastRunInput(null);
                setActiveCandidateId(null);
                setSelectedCandidateIds([]);
                setMarkdown(null);
              }}
            >
              {roles.map((role) => (
                <option key={role.roleId} value={role.roleId}>{role.title}</option>
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
              <p>{selectedRole.department} · {selectedRole.seniority} · {selectedRole.location}</p>
              <div className="requirement-list">
                <span>Required evidence</span>
                {selectedRole.requiredSkills.map((skill) => <em key={skill}>{skill}</em>)}
              </div>
            </motion.div>
          )}

          <div className="guidance-block">
            <label className="field-label" htmlFor="guidance">Recruiter guidance <i>optional</i></label>
            <textarea
              id="guidance"
              value={guidance}
              onChange={(event) => setGuidance(event.target.value)}
              placeholder="Tell the agent what matters for this search…"
              maxLength={800}
            />
            <div className="example-prompts">
              {GUIDANCE_EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => setGuidance(example)}>{example}</button>
              ))}
            </div>
          </div>

          <button className="run-button" type="button" onClick={runMatch} disabled={loading || !roleId}>
            <span>{loading ? "Evaluating profiles" : "Run candidate match"}</span>
            <span aria-hidden="true">→</span>
          </button>
          <p className="model-note">Scores stay deterministic. AI interprets guidance and writes evidence-grounded briefs.</p>
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
                  <span>{result.totalConsidered} unique profiles considered</span>
                  <span>{result.duplicatesHidden} duplicates hidden</span>
                </div>
              )}
            </div>

            {error && <div className="error-banner" role="alert">{error}</div>}

            {resultsAreStale && (
              <motion.div
                className="stale-results"
                role="status"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div>
                  <strong>Results are out of date</strong>
                  <span>Recruiter guidance changed after this shortlist was generated.</span>
                </div>
                <button type="button" onClick={runMatch} disabled={loading}>
                  {loading ? "Updating…" : "Run updated match"}
                </button>
              </motion.div>
            )}

            {!result && !loading && (
              <motion.div className="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="empty-orbit" aria-hidden="true"><span>120</span></div>
                <h3>Ready to compare evidence</h3>
                <p>Select a role, add any recruiter priorities, and run the match. The system will retrieve, deduplicate, score, and explain the strongest profiles.</p>
              </motion.div>
            )}

            {loading && !result && (
              <div className="loading-state" aria-live="polite">
                <div className="scan-line" />
                <span>Reading candidate evidence…</span>
              </div>
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
                    visible: { transition: { staggerChildren: 0.06 } }
                  }}
                >
                  <div className="interpreted-guidance">
                    <span>Rubric</span>
                    <strong>{result.guidance.summary}</strong>
                    <i>{result.guidance.interpretedBy === "openai" ? "AI interpreted" : "Rule interpreted"}</i>
                  </div>
                  {result.appliedConstraints.length > 0 && result.candidates.length < result.requestedLimit && (
                    <div className="constraint-summary" role="status">
                      <strong>{result.candidates.length} candidates met every mandatory requirement.</strong>
                      <span>{result.appliedConstraints.join(" · ")}</span>
                    </div>
                  )}
                  {result.candidates.map((candidate) => (
                    <CandidateRow
                      key={candidate.candidateId}
                      candidate={candidate}
                      active={activeCandidate?.candidateId === candidate.candidateId}
                      selected={selectedCandidateIds.includes(candidate.candidateId)}
                      disabled={resultsAreStale}
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
                <span>selected for hiring manager</span>
              </div>
              <button
                ref={approveButtonRef}
                type="button"
                onClick={approveSelection}
                disabled={loading || resultsAreStale || selectedCandidateIds.length === 0}
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
                  <div className="candidate-monogram">{activeCandidate.candidateId.replace(/[^0-9]/g, "").slice(-2) || "AI"}</div>
                  <div>
                    <span>{activeCandidate.candidateId}</span>
                    <h2>{activeCandidate.headline}</h2>
                  </div>
                </div>

                <div className="score-lockup">
                  <div><strong>{formatScore(activeCandidate.score)}</strong><span>/100 match</span></div>
                  <div><strong>{activeCandidate.confidence}%</strong><span>evidence confidence</span></div>
                </div>

                <section className="inspector-section">
                  <h3>Why this candidate</h3>
                  <p>{activeCandidate.whyFit}</p>
                </section>

                <section className="inspector-section">
                  <h3>Score composition</h3>
                  <div className="breakdown-list">
                    {Object.entries(activeCandidate.scoreBreakdown).map(([key, value]) => (
                      <div key={key}>
                        <span>{BREAKDOWN_LABELS[key] ?? key}</span>
                        <div><motion.i initial={{ width: 0 }} animate={{ width: `${Math.min(100, value * 3)}%` }} /></div>
                        <b>{formatScore(value)}</b>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="inspector-section">
                  <h3>Evidence & gaps</h3>
                  <div className="evidence-tags">
                    {activeCandidate.matchedRequiredSkills.map((skill) => <span key={skill}>✓ {skill}</span>)}
                  </div>
                  <ul className="gap-list">
                    {activeCandidate.gaps.map((gap) => <li key={gap}>{gap}</li>)}
                  </ul>
                </section>

                <section className="inspector-section questions-section">
                  <h3>Questions to ask</h3>
                  <ol>
                    {activeCandidate.clarifyingQuestions.map((question) => <li key={question}>{question}</li>)}
                  </ol>
                </section>

                {(activeCandidate.dataQuality.length > 0 || activeCandidate.duplicateIds?.length) && (
                  <section className="quality-note">
                    <strong>Evidence notes</strong>
                    {activeCandidate.dataQuality.map((issue) => <span key={issue.code}>{issue.message}</span>)}
                    {activeCandidate.duplicateIds?.length ? <span>Duplicate profile hidden: {activeCandidate.duplicateIds.join(", ")}</span> : null}
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

function BriefDialog({
  markdown,
  copied,
  returnFocusRef,
  onClose,
  onCopy,
  onDownload
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
        <button type="button" onClick={closeDialog} aria-label="Close brief" autoFocus>×</button>
      </div>
      <pre>{markdown}</pre>
      <div className="modal-actions">
        <button type="button" onClick={onCopy}>{copied ? "Copied" : "Copy Markdown"}</button>
        <button type="button" className="primary" onClick={onDownload}>Download .md</button>
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
  onToggle
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
      variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
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
          <small>{candidate.candidateId} · {candidate.experienceYears ?? "?"} yrs · {candidate.location ?? "Location unknown"}</small>
          <span className="row-skills">
            {candidate.matchedRequiredSkills.slice(0, 3).map((skill) => <i key={skill}>{skill}</i>)}
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
