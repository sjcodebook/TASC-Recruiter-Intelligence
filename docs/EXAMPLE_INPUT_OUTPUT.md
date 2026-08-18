# Example input and output

This example uses the supplied Data Analyst role and candidate dataset with OpenAI enabled.

## Default role rubric

With no recruiter guidance, the role's own skills, experience range, seniority evidence, and Dubai location determine technical role fit. A verified browser run produced this review order:

| Rank | Candidate | Location | Technical fit |
| ---: | --- | --- | ---: |
| 1 | C117 | Dubai | 85.2 |
| 2 | C037 | Riyadh | 77.6 |
| 3 | C032 | Abu Dhabi | 76.3 |
| 4 | C040 | Abu Dhabi | 75.5 |
| 5 | C101 | Cairo | 74.6 |

C117 leads because it has strong required-skill and role evidence plus an exact location match. Being one year above the target range is only a modest experience mismatch.

## Guided request

```json
{
  "roleId": "R004",
  "guidance": "Prioritize candidates available immediately and have to be from Dubai",
  "guidanceOverrides": {},
  "limit": 5
}
```

## Interpreted guidance

```json
{
  "summary": "Require dubai-based candidates; Prefer immediate availability.",
  "location": {
    "value": "dubai",
    "mode": "required",
    "sourceText": "have to be from Dubai"
  },
  "availability": {
    "value": 0,
    "mode": "preferred",
    "sourceText": "Prioritize candidates available immediately"
  },
  "priorityTerms": [],
  "experienceWeightDelta": 0,
  "interpretedBy": "openai"
}
```

The Dubai clause is a hard eligibility requirement. Immediate availability is a preference, so it changes order without removing candidates who have a notice period.

## Shortlist excerpt

```json
{
  "totalConsidered": 110,
  "duplicatesHidden": 10,
  "candidates": [
    {
      "rank": 1,
      "candidateId": "C035",
      "score": 73.8,
      "roleFitScore": 69.0,
      "preferenceScore": 85.0,
      "confidence": 100,
      "fitBand": "Promising",
      "noticePeriod": "2 weeks notice",
      "matchedRequiredSkills": ["SQL", "Python/R", "statistics"]
    },
    {
      "rank": 2,
      "candidateId": "C117",
      "score": 59.5,
      "roleFitScore": 85.2,
      "preferenceScore": 0,
      "confidence": 82,
      "fitBand": "Stretch",
      "noticePeriod": "90 days notice"
    }
  ]
}
```

C117 remains the stronger technical match. C035 ranks first in this run because both candidates satisfy the required Dubai constraint, while C035's two-week notice is much closer to the explicit availability preference.

If the recruiter changes immediate availability from preferred to required, neither candidate qualifies and the UI explains that no profile met all constraints. That is filtering, not a score penalty.

## Approved Markdown excerpt

```markdown
# Candidate shortlist: Data Analyst

**Location:** Dubai

## 1. C035 - Data analyst with a passion for turning numbers into decisions

**Match score:** 73.8/100
**Technical role fit:** 69.0/100
**Recruiter priorities:** 85.0/100
**Evidence confidence:** 100%
**Location:** Dubai, UAE
**Availability:** 2 weeks notice

### Why this candidate

The candidate is Dubai-based and has evidence of SQL, Python/R, and statistics.
The two-week notice period is closer to the immediate-availability preference.

### Gaps to validate

- Data visualization capability is not evidenced.
- Experience is above the stated target range.
- Immediate availability is not confirmed.
```
