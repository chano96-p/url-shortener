CREATE TABLE IF NOT EXISTS urls (
  id           BIGSERIAL PRIMARY KEY,
  short_code   VARCHAR(10) NOT NULL,
  original_url TEXT        NOT NULL,
  click_count  BIGINT      NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      BIGINT
);

CREATE INDEX IF NOT EXISTS idx_urls_short_code
  ON urls(short_code);

CREATE INDEX IF NOT EXISTS idx_urls_user_created
  ON urls(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_urls_created_id
  ON urls(created_at DESC, id DESC);
  