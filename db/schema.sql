-- PolyChronicle database schema (PostgreSQL / TigerData).
-- Idempotent: safe to re-run with `npm run db:migrate`. Never drops data.

-- Accounts. Passwords are salted scrypt hashes; terms acceptance is versioned.
CREATE TABLE IF NOT EXISTS ph_users (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ph_users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE ph_users ADD COLUMN IF NOT EXISTS terms_version text;

-- Sign-in sessions. Only a SHA-256 hash of the cookie token is stored.
CREATE TABLE IF NOT EXISTS ph_sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES ph_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ph_sessions_user ON ph_sessions(user_id);

-- One row per requested film: prompt, research, sources and the full script (plan).
CREATE TABLE IF NOT EXISTS ph_videos (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES ph_users(id) ON DELETE CASCADE,
  prompt     text NOT NULL,
  title      text NOT NULL DEFAULT 'Untitled history',
  duration   integer NOT NULL CHECK (duration BETWEEN 20 AND 60),
  status     text NOT NULL DEFAULT 'researching',
  plan       jsonb,
  research   text,
  sources    jsonb NOT NULL DEFAULT '[]',
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ph_videos ADD COLUMN IF NOT EXISTS aspect text NOT NULL DEFAULT 'landscape';
ALTER TABLE ph_videos ADD COLUMN IF NOT EXISTS gif_asset_id uuid;
ALTER TABLE ph_videos ADD COLUMN IF NOT EXISTS poster_asset_id uuid;
-- Recorded narration (WAV), stored as an asset like the renders.
ALTER TABLE ph_videos ADD COLUMN IF NOT EXISTS narration_asset_id uuid;
ALTER TABLE ph_videos ADD COLUMN IF NOT EXISTS gif_bytes integer;
CREATE INDEX IF NOT EXISTS ph_videos_user_date ON ph_videos(user_id, created_at DESC);

-- Rendered media (movie, GIF and JPEG poster), uploaded in 1 MiB chunks, and recorded narration.
CREATE TABLE IF NOT EXISTS ph_assets (
  id          uuid PRIMARY KEY,
  video_id    uuid NOT NULL REFERENCES ph_videos(id) ON DELETE CASCADE,
  mime        text NOT NULL,
  total_bytes integer NOT NULL CHECK (total_bytes BETWEEN 1 AND 33554432),
  chunk_count integer NOT NULL CHECK (chunk_count BETWEEN 1 AND 64),
  complete    boolean NOT NULL DEFAULT false,
  sha256      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ph_assets_video ON ph_assets(video_id);

CREATE TABLE IF NOT EXISTS ph_asset_chunks (
  asset_id    uuid NOT NULL REFERENCES ph_assets(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  data        bytea NOT NULL CHECK (octet_length(data) <= 1048576),
  PRIMARY KEY (asset_id, chunk_index)
);

-- Fixed-window rate-limit counters keyed by account or hashed IP.
CREATE TABLE IF NOT EXISTS ph_rate_limits (
  key      text PRIMARY KEY,
  count    integer NOT NULL,
  reset_at timestamptz NOT NULL
);

-- Safety audit log (event = 'moderation'). Rows are removed with the account
-- by lib/server/account.ts; the SET NULL here only covers direct user deletes.
CREATE TABLE IF NOT EXISTS ph_audit (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid REFERENCES ph_users(id) ON DELETE SET NULL,
  event      text NOT NULL,
  details    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-user cache of generated ModelDefinitions (saved videos embed their own copies).
CREATE TABLE IF NOT EXISTS ph_model_cache (
  user_id       uuid NOT NULL REFERENCES ph_users(id) ON DELETE CASCADE,
  cache_key     text NOT NULL,
  definition    jsonb NOT NULL,
  skill_version text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cache_key)
);

-- The runtime role (DATABASE_URL) gets DML only; migrations use an admin role.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'polyhistor_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ph_model_cache TO polyhistor_app;
  END IF;
END $$;
