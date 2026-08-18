# Suggested Loom walkthrough (3-6 minutes)

## 0:00-0:40 - Problem and product choice

"I built this for an in-house recruiter who needs a defensible shortlist, not an autonomous hiring decision. The core workflow is role selection, optional recruiter guidance, evidence review, and explicit approval into a hiring-manager brief."

## 0:40-1:40 - Demo the workflow

1. Select the Data Analyst role.
2. Click "Prioritize candidates available immediately."
3. Run the match.
4. Point out 110 unique profiles considered and ten duplicates hidden.
5. Open two different candidates and compare match score with evidence confidence.
6. Show score composition, matched evidence, gaps, and exactly three questions.
7. Select candidates, approve them, and download the Markdown brief.

## 1:40-3:20 - Explain the AI system

"The system is hybrid. pgvector retrieves semantically relevant profiles, then a deterministic rubric ranks them. Technical role fit combines required skills, role evidence, experience, preferred skills, and role location. Relative guidance can transfer weight between role evidence and experience without changing the rubric's 100-point total. When recruiter preferences exist, the final score is 70% technical fit and 30% recruiter-priority alignment. The model interprets natural language and writes explanations, but it does not secretly choose the ranking."

Show these folders:

- `server/src/controllers`
- `server/src/services`
- `server/src/repositories`
- `server/src/infrastructure`

"I use constructor injection with TypeDI, but container lookup is limited to the composition root. This keeps services independently testable."

## 3:20-4:20 - Reliability and messy data

"The supplied dataset includes missing records, invalid experience, reversed education dates, inconsistent locations, and duplicate profiles. I preserve uncertainty as data-quality notes and lower evidence confidence rather than making facts up. OpenAI configuration is required, and provider failures are explicit so the system never silently changes embedding or explanation behavior."

## 4:20-5:20 - Evaluation and production direction

"At scale I would build a multi-rater recruiter judgment set, measure NDCG and precision at five, audit evidence precision and counterfactual stability, and run a staged A/B test on shortlist acceptance and recruiter time saved. Recruiter overrides become evaluation data, not unchecked online self-training."

Close by showing `docs/PROMPTS.md`, the passing tests, and the Railway service layout in the README.
