CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS roles (
  role_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  nice_to_have_skills TEXT[] NOT NULL DEFAULT '{}',
  experience_min INTEGER NOT NULL,
  experience_max INTEGER NOT NULL,
  seniority TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
  candidate_id TEXT PRIMARY KEY,
  source_candidate_id TEXT,
  headline TEXT NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  experience_years NUMERIC,
  past_roles TEXT,
  certifications TEXT,
  education TEXT,
  projects TEXT,
  extra_curriculars TEXT,
  location TEXT,
  normalized_location TEXT,
  notice_period TEXT,
  notice_days INTEGER,
  profile_text TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  data_quality JSONB NOT NULL DEFAULT '[]'::jsonb,
  embedding vector(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS candidates_fingerprint_idx ON candidates (content_fingerprint);
CREATE INDEX IF NOT EXISTS candidates_location_idx ON candidates (normalized_location);
CREATE INDEX IF NOT EXISTS candidates_embedding_hnsw_idx
  ON candidates USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS match_runs (
  run_id UUID PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(role_id),
  raw_guidance TEXT NOT NULL DEFAULT '',
  interpreted_guidance JSONB NOT NULL,
  ai_mode TEXT NOT NULL,
  prompt_version TEXT NOT NULL DEFAULT 'match-v1',
  approved_candidate_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_results (
  run_id UUID NOT NULL REFERENCES match_runs(run_id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES candidates(candidate_id),
  rank INTEGER NOT NULL,
  score NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  score_breakdown JSONB NOT NULL,
  explanation JSONB NOT NULL,
  PRIMARY KEY (run_id, candidate_id)
);
