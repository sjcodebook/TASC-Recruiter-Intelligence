# Five-minute Loom outline

This is a speaking guide, not a script to read word for word. Keep the product visible for most of the recording.

## 0:00–0:35 · Frame the problem

“I built this for an in-house recruiter who needs a defensible review order, not an automated hiring decision. The recruiter chooses a role, adds optional priorities, reviews the supporting evidence, and approves candidates into a Markdown brief.”

Briefly show the role list and the supplied dataset size.

## 0:35–1:50 · Run a real match

1. Select **Data Analyst**.
2. Run the default rubric and point out that the role's Dubai location already affects technical fit.
3. Open the first two candidates and compare score with evidence confidence.
4. Show matched requirements, gaps, and the three questions.
5. Add: “Prioritize candidates available immediately and have to be from Dubai.”
6. Run it again and show that Dubai is required while availability is preferred.

Say: “The UI makes the interpretation visible. The recruiter can change either criterion between preferred and required instead of trusting a hidden model decision.”

## 1:50–2:35 · Complete the workflow

Select one or two candidates. Point out that nothing is selected automatically. Choose **Approve & create brief**, then show the Markdown preview, copy action, and download action.

“This is the handoff artifact the recruiter can edit and send to the hiring manager.”

## 2:35–3:35 · Explain the matching system

Show the README architecture diagram and score table.

“OpenAI embeds the role query, and pgvector retrieves relevant profiles. Deterministic code then scores required skills, role evidence, experience, nice-to-have skills, and the location already present in the role data. With recruiter preferences, the final score is 70% technical fit and 30% preference alignment. Explicit constraints filter candidates.”

“The model receives the completed rank and evidence to write the explanation. It cannot choose or recompute the ranking.”

Briefly show `server/src/controllers`, `services`, `repositories`, and `infrastructure`. Mention that TypeDI uses constructor injection and container lookup is kept at the composition root.

## 3:35–4:15 · Discuss messy data and safety

“The dataset contains missing values and duplicates. I preserve unknowns, attach data-quality issues, and calculate evidence confidence separately from match score. Exact duplicates are grouped, leaving 110 unique profiles from the 120 rows.”

“Candidate text is untrusted evidence. Structured Outputs and a sanitizer enforce the explanation shape, and OpenAI failures remain explicit rather than silently switching behavior.”

## 4:15–4:50 · Explain evaluation at scale

“I would build a multi-rater recruiter judgment set and track Precision@5, NDCG@5, and evidence precision. I would add contrast tests for soft versus hard guidance, evaluate relevant slices and counterfactual stability, then run a staged rollout measuring shortlist acceptance, recruiter time saved, reorders, and hiring-manager acceptance.”

## 4:50–5:00 · Close

Show the passing tests and documentation links.

“The key product choice is that AI handles language and explanation, while the consequential ranking remains inspectable and under recruiter control.”
