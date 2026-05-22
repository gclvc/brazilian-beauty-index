-- BBI subscribers: add segment + interests for curated content
-- Run this against the Supabase project (bkgsspvintskiiallxxp / pro-leads-brae-kac)

ALTER TABLE bbi_subscribers
  ADD COLUMN IF NOT EXISTS segment text CHECK (segment IN ('consumer','professional','distributor','media')),
  ADD COLUMN IF NOT EXISTS interests text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS bbi_subscribers_segment_idx ON bbi_subscribers (segment);
CREATE INDEX IF NOT EXISTS bbi_subscribers_interests_gin ON bbi_subscribers USING gin (interests);

COMMENT ON COLUMN bbi_subscribers.segment   IS 'Who the reader is: consumer / professional / distributor / media';
COMMENT ON COLUMN bbi_subscribers.interests IS 'What they want: hair, skin, makeup, body, nails, trends, ingredients, brands';
