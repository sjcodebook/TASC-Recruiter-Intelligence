# Example input and output

This example was generated from the supplied CSVs in local evaluation mode.

## Input

```json
{
  "roleId": "R004",
  "guidance": "Prioritize candidates available immediately",
  "limit": 5
}
```

## Interpreted guidance

```json
{
  "summary": "prioritize immediate availability",
  "maxNoticeDays": null,
  "requiredLocation": null,
  "priorityTerms": ["immediate availability"],
  "deprioritizedTerms": [],
  "experienceWeightDelta": 0,
  "interpretedBy": "local"
}
```

The wording is a soft preference, so it changes ranking but does not filter candidates.

## Shortlist excerpt

```json
{
  "totalConsidered": 115,
  "duplicatesHidden": 5,
  "candidates": [
    {
      "rank": 1,
      "candidateId": "C039",
      "score": 74.2,
      "confidence": 96,
      "fitBand": "Promising",
      "matchedRequiredSkills": [
        "SQL",
        "Python/R",
        "data visualization",
        "statistics"
      ],
      "gaps": [
        "Location alignment with Dubai should be confirmed."
      ],
      "clarifyingQuestions": [
        "What is your availability to work in Dubai, including relocation or travel expectations?",
        "Which accomplishment best demonstrates your readiness for the scope and seniority of this Data Analyst role?",
        "What measurable outcome from your recent work best demonstrates the impact you would bring to this Data Analyst role?"
      ]
    }
  ]
}
```

## Approved Markdown excerpt

```markdown
# Candidate shortlist: Data Analyst

**Location:** Dubai

## 1. C039 - Data-driven analyst with e-commerce and retail background

**Match score:** 74/100  
**Evidence confidence:** 96%  
**Location:** Alexandria, Egypt  
**Availability:** Available immediately

### Why this candidate

The profile shows evidence for SQL, Python/R, data visualization, and 3 years of
reported experience is available for review, making this a defensible Data
Analyst conversation.

### Gaps to validate

- Location alignment with Dubai should be confirmed.

### Recommended interview questions

1. What is your availability to work in Dubai, including relocation or travel expectations?
2. Which accomplishment best demonstrates your readiness for the scope and seniority of this Data Analyst role?
3. What measurable outcome from your recent work best demonstrates the impact you would bring to this Data Analyst role?
```

