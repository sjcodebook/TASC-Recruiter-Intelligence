# Matching system

This document contains the implementation details behind the shortlist. The short version is simple: pgvector finds plausible profiles, deterministic code scores them, and OpenAI explains the resulting evidence. The model does not choose the ranking.

## 1. Preparing the data

The seed process reads the supplied CSVs, normalizes obvious formatting differences, creates a searchable profile string, and records data-quality issues without filling in missing facts.

- Skills and locations are normalized for comparison.
- Written and numeric experience values are parsed when possible. Invalid or negative values remain unknown.
- Notice periods are converted into days when the meaning is clear.
- A content fingerprint identifies exact duplicate profiles.
- Each candidate gets a 256-dimension OpenAI embedding stored in Postgres.

All 120 source profiles remain in the database. Exact duplicates are grouped at retrieval time, which currently produces 110 unique profiles and reports the 10 hidden duplicates in the interface.

## 2. Retrieval

The retrieval query combines the role title, department, required skills, nice-to-have skills, and any recruiter guidance. OpenAI embeds that query with `text-embedding-3-small`.

Postgres uses an HNSW pgvector index and cosine distance to retrieve up to 120 profiles. Retrieval is intentionally broad for this dataset. Its job is to supply semantic similarity and avoid relying only on exact keywords; it does not determine the final order.

## 3. Technical role fit

The default role-fit score totals 100 points.

| Component | Formula | Maximum |
| --- | --- | ---: |
| Required skills | matched requirements ÷ total requirements | 40 |
| Role evidence | 60% semantic similarity + 40% title/past-role token overlap | 30 |
| Experience | distance from the role's stated range | 10 |
| Nice-to-have skills | matched nice-to-haves ÷ total nice-to-haves | 5 |
| Role location | exact city, same country, or no match | 15 |

### Required skills

Skill matching uses normalized text plus a small alias map. Each required skill contributes an equal share of the 40 points. The interface distinguishes matched requirements from requirements that are not evidenced.

### Role evidence

Semantic similarity is clamped between zero and one. Title and past-role overlap compares normalized tokens from the role title and department with the candidate's headline and previous roles.

```text
role evidence = 30 × (0.6 × semantic similarity + 0.4 × role-token overlap)
```

The mix lets resume wording vary while retaining a direct signal that the candidate has worked in a related role.

### Experience

A candidate inside the stated range receives full experience points. Outside the range, the factor falls by 0.2 for each year of distance, with a floor of 0.2. Unknown experience receives a neutral factor of 0.5 and a confidence penalty.

Being slightly above the range is therefore a modest mismatch, not an automatic rejection.

### Location

An exact role-city match receives 15 points. A known same-country match receives 6 points; another or unknown location receives zero. This makes the location provided in `open_roles.csv` meaningful even when the recruiter gives no additional guidance.

## 4. Recruiter guidance

OpenAI converts free text into a typed structure containing:

- required or preferred allowed or excluded locations;
- required or preferred availability;
- required, preferred, or excluded evidence terms;
- required or preferred minimum and maximum experience;
- an optional adjustment to the importance of experience.

A deterministic parser recognizes high-impact language and reconciles every model-extracted criterion with the same precedence rules. This is a constraint-safety layer, not an offline AI fallback. The UI labels the result “AI + rules” and lets the recruiter change any extracted criterion between preferred and required before rerunning the match.

The interpretation order is:

1. Explicit soft language such as “prefer,” “prioritize,” “ideally,” “would like,” or “if possible” means preferred, even when the same clause contains “should” or “within.”
2. Otherwise “must,” “required,” “only,” “have to,” “need to,” “should,” and bare structured statements mean required.
3. “Not required,” “doesn't have to,” “optional,” and similar phrases remove the criterion instead of reversing it.
4. “Must not,” “exclude,” “except,” “avoid,” and “without” create an excluded location or evidence term.

Alternatives in one clause are preserved, so “Dubai or Abu Dhabi only” is one required allowed-location set. Availability in weeks and months is converted to days. Experience statements such as “at least five years,” “at most five years,” and ranges become numeric criteria.

### Preferences

When at least one preference exists:

```text
final score = 70% technical role fit + 30% recruiter-priority score
```

Multiple recruiter preferences are scored separately and averaged. For example, immediate availability gives 100 points for an immediate start, 85 within 14 days, 65 within 30 days, 30 within 60 days, and zero beyond 60 days. Unknown availability receives 15 rather than being treated as confirmed alignment. Preferred evidence terms score on supported profile text, and preferred experience uses a gradual distance score.

The phrase “value client-facing experience over years of experience” also moves five points from the experience component to role evidence. The technical rubric still totals 100 points.

### Required constraints

Required allowed locations must match one listed value; required excluded locations must match none. Required availability needs a known notice period at or below the requested number of days. Required evidence terms must be supported by the profile, excluded terms must not be present, and required experience needs a known value inside the stated bounds.

Hard constraints filter candidates before the shortlist is created. They do not merely subtract points.

## 5. Relevance floor and ranking

After scoring, a candidate must satisfy both conditions to appear:

1. At least 50% of required skills are evidenced.
2. Technical role fit is at least 45/100.

Eligible and qualified candidates sort by final score, then evidence confidence. The selected shortlist receives ranks only after filtering, so the displayed rank always matches the visible order.

## 6. Evidence confidence

Match score and confidence answer different questions. The match score estimates role alignment; confidence estimates how trustworthy and complete the supplied profile is.

Confidence starts at 100 and subtracts 18 points for each high-severity data issue, 9 for medium severity, 4 for low severity, and 4 when duplicate IDs were grouped into the displayed profile. It has a floor of 35.

This prevents incomplete data from silently looking definitive without forcing every incomplete candidate to the bottom of the ranking.

## 7. Explanations and questions

The final shortlist, ranks, scores, score breakdowns, confidence, and evidence are passed to OpenAI. The explanation prompt explicitly forbids reranking, ordinal claims, invented experience, and treating unscored facts as ranking drivers.

Structured Outputs require one explanation, at least one gap, and exactly three questions per candidate. A sanitizer rejects leaked field names, malformed text, duplicates, or the wrong question count. Provider failures fail the operation instead of switching to different local behavior.

## 8. Approval

No candidate is selected automatically after a match. The recruiter chooses candidates, the API verifies that every selected ID belongs to the persisted match run, and the approved IDs are recorded. The resulting Markdown contains scores, confidence, location, availability, reasoning, gaps, and interview questions in shortlist order.

## Known limits

- The alias map is intentionally small and would need evaluation by role family.
- Deduplication detects exact normalized duplicates, not fuzzy or near-duplicate resumes.
- Retrieval evaluates the full supplied dataset; a much larger corpus would need recall and latency tuning.
- Confidence reflects profile completeness issues, not independent verification of candidate claims.
- The current prototype has no authentication, authorization, or recruiter-level audit trail.
- Production use would require legal review, fairness monitoring, access controls, and ongoing human evaluation.
