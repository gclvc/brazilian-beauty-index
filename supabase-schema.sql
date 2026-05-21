-- Brazilian Beauty Index — Supabase Schema
-- Run this in the Supabase SQL Editor for the pro-leads-brae-kac project

-- Newsletter subscribers
CREATE TABLE IF NOT EXISTS bbi_subscribers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  first_name TEXT,
  status     TEXT DEFAULT 'active',   -- active | unsubscribed
  source     TEXT DEFAULT 'website',
  tags       TEXT[]
);
ALTER TABLE bbi_subscribers DISABLE ROW LEVEL SECURITY;
GRANT INSERT, SELECT ON bbi_subscribers TO anon;
CREATE INDEX IF NOT EXISTS idx_bbi_subscribers_email ON bbi_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_bbi_subscribers_status ON bbi_subscribers(status);

-- Brand registrations
CREATE TABLE IF NOT EXISTS bbi_brand_registrations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  brand_name TEXT NOT NULL,
  website    TEXT,
  email      TEXT NOT NULL,
  category   TEXT,      -- hair | skin | nails | makeup | body | wellness
  markets    TEXT,
  message    TEXT,
  status     TEXT DEFAULT 'new'  -- new | contacted | partner | rejected
);
ALTER TABLE bbi_brand_registrations DISABLE ROW LEVEL SECURITY;
GRANT INSERT ON bbi_brand_registrations TO anon;
CREATE INDEX IF NOT EXISTS idx_bbi_brands_status ON bbi_brand_registrations(status);
CREATE INDEX IF NOT EXISTS idx_bbi_brands_created ON bbi_brand_registrations(created_at DESC);
