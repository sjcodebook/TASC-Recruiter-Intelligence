# Four-to-five-minute demo script

This sequence starts with the product, then shows the code map, and finishes with the matching logic. Aim for a calm pace rather than trying to mention every implementation detail.

## Before recording

- Open the live app, the repository in your editor, and `docs/TASC_SYSTEM_DEMO.excalidraw` in Excalidraw.
- In Excalidraw, know where the three frames are: **Code map**, **End-to-end matching flow**, and **Score + guardrails**.
- Pre-run the exact demo search once so the repeat is served from the exact-result cache.
- Suggested demo: **Data Analyst** with `Must be based in Dubai and prioritize candidates available within 30 days.`
- Reset the app to its initial state before recording. Close notifications and keep browser zoom readable.

## 0:00–0:20 · Set the context

**Show:** The application landing state.

**Say:**

“This is TASC Recruiter Intelligence. A recruiter selects an open role, adds optional hiring priorities, and receives a ranked, evidence-backed shortlist. The product recommends a review order; it does not make a hiring decision.”

## 0:20–1:45 · Demonstrate the recruiter workflow

**Show:** Select **Data Analyst**, enter the suggested guidance, and run the match.

**Say while it runs:**

“The role already contains its required skills, target experience, seniority, and location. Recruiter guidance adds intent for this particular search. Here, Dubai is a hard constraint because I said ‘must,’ while availability is a preference because I said ‘prioritize.’ The interpreted rubric is visible rather than hidden inside a prompt.”

“The deterministic shortlist appears first, so the recruiter does not wait for the slower writing step. Candidate order and scores are already final; the evidence panel clearly shows that the summaries and interview questions are still being generated, and approval remains disabled until they are complete.”

**Show:** The ranked shortlist and the duplicate count. Open the first candidate.

“The system retrieves across all 120 supplied profiles, groups exact duplicates, and displays the strongest eligible candidates. For each candidate I can inspect the overall score, technical fit, recruiter-priority alignment, evidence confidence, component-level score, supported skills, gaps, and three questions to ask.”

**Show:** Select one candidate and open **Approve & create brief**.

“Nothing is selected automatically. The recruiter makes the final choice, and the API verifies that the selected candidate belongs to this run before producing a Markdown brief for the hiring manager.”

## 1:45–2:25 · Explain the code structure

**Show:** Excalidraw frame **1 · Code map**, then briefly reveal the same folders in the editor.

**Say:**

“The implementation is deliberately small. The Next.js application owns the recruiter workspace and typed API state. The Express app is the composition root, with controllers handling HTTP validation. Match Service orchestrates the use case, Guidance Service interprets recruiter intent, and Scoring Service contains the deterministic business rules. Repositories isolate Postgres and pgvector access, while the OpenAI gateway contains embeddings and Structured Output calls. TypeDI provides constructor injection, but container resolution stays at the composition roots.”

## 2:25–3:45 · Walk through one matching request

**Show:** Excalidraw frame **2 · End-to-end matching flow**. Follow the arrows.

**Say:**

“A match request loads the role and current dataset version. An exact completed search can be reused safely, but it still receives a fresh run ID so approval state remains independent.

On a new search, OpenAI extracts typed guidance, and deterministic wording rules resolve consequential language such as required versus preferred. The role, skills, and interpreted guidance form the retrieval query. OpenAI creates a 256-dimension embedding, and pgvector uses cosine similarity with an HNSW index to retrieve broadly. Exact duplicate profiles are grouped before scoring.

From this point the model does not control the order. Deterministic code scores every candidate, applies hard constraints and the relevance floor, sorts the eligible pool, and selects the top five. That exact ranking is persisted and returned immediately. A second request gives the unchanged shortlist to OpenAI for concise evidence briefs. It is explicitly forbidden from reranking or inventing missing facts. The run moves from ranking-ready to explaining to complete, and refresh recovery reads the same persisted state.”

## 3:45–4:30 · Explain the score and guardrails

**Show:** Excalidraw frame **3 · Score + guardrails**.

**Say:**

“Without recruiter preferences, technical role fit totals 100 points: 40 for required skills, 30 for semantic and role evidence, 10 for experience, 5 for nice-to-have skills, and 15 for the role location.

Preferences create a separate priority score, so the final result becomes 70 percent technical fit and 30 percent recruiter priorities. Required guidance is never a bonus; it is a filter. Candidates must also evidence at least half the required skills, reach a technical-fit floor of 45, and meet the effective experience minimum when experience is known. Confidence is separate from fit and only reflects how complete and trustworthy the supplied profile is.”

## 4:30–4:55 · Close with the design decision

**Show:** Zoom back to the full Excalidraw canvas or return to the shortlist.

**Say:**

“The central design choice is a hybrid system. AI handles flexible language, semantic retrieval, and evidence-grounded writing. Deterministic code owns eligibility, scoring, and rank, and the recruiter owns the final decision. That gives us useful AI behavior without turning the shortlist into an unauditable batch-model judgment. Thank you for watching.”

## If you have ten extra seconds

“For production evaluation, I would use recruiter-labelled role-candidate pairs and track Precision at 5, NDCG at 5, evidence precision, recruiter reorders, and shortlist acceptance across role and data-quality slices.”
