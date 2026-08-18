# Example input and output

This example was generated from the supplied CSVs with OpenAI enabled.

## Input

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

The location clause is an eligibility requirement. Immediate availability is a preference, so it changes ranking without filtering candidates who have a notice period.

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
      "noticePeriod": "90 days notice"
    }
  ]
}
```

C117 is the stronger technical match, but C035 ranks first because its two-week notice period is substantially closer to the recruiter's explicit availability preference.

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

The candidate is Dubai-based and has strong evidence of SQL, Python/R, and
statistics, with a two-week notice period that is closer to the
immediate-availability preference.

### Gaps to validate

- Data visualization capability is not evidenced.
- Experience is above the stated target range.
- Immediate availability is not confirmed.
```
