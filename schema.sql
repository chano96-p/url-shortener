CREATE TABLE urls (
  id           BIGSERIAL PRIMARY KEY,
  short_code   VARCHAR(10) NOT NULL,
  original_url TEXT        NOT NULL,
  click_count  BIGINT      NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_urls_short_code ON urls(short_code);
