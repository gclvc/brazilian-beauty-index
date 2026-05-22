# Brazilian Beauty Index — Website

Static HTML editorial site deployed to Vercel. Live at [brazilianbeautyindex.com](https://brazilianbeautyindex.com).

**Full docs are in the brand folder:** `TKC MASTERPLAN/BRAZILIAN BEAUTY INDEX/docs/`. Start with `01-overview.md`.

## Stack

- Static HTML + Alpine.js (no build step)
- Vercel edge for hosting + `/api/*` functions
- Supabase Postgres for subscribers + brand registrations
- Resend for transactional email
- GitHub Actions for weekly auto-publish

## Local dev

```bash
npx serve -p 4201 .
# then open http://localhost:4201
```

`/api/*` routes only work on the Vercel deploy (not locally). Test those via the live site.

## File layout

```
index.html             Homepage (Alpine reads posts.json)
blog/
  index.html           Article listing
  post.html            Article template (reads ?slug=)
  posts.json           Content database (108 articles)
tools/                 Interactive tools (Hair Damage Assessment, etc.)
admin/                 Password-protected CMS (saves via GitHub API)
ads/                   Banner system (ads.json + ads.js + ads.css)
api/                   Vercel edge functions
scripts/               Content + image generation (Node)
supabase/              SQL migrations
.github/workflows/     Weekly auto-publish cron
```

## Common commands

```bash
# Publish a single article (generates via Claude API, picks oldest todo from topics.json)
node scripts/generate-post.mjs

# Batch generation
node scripts/generate-batch.mjs --limit 5

# Fetch K&C product images (no API key needed)
node scripts/fetch-product-images.mjs

# Fetch Unsplash images (needs key)
UNSPLASH_KEY=... node scripts/fetch-unsplash-images.mjs

# Deploy to production
npx vercel --yes --prod --scope guilherme-cezars-projects
```

## Environment variables (Vercel)

```
ANTHROPIC_API_KEY          Content generation
RESEND_API_KEY             Welcome emails
BBI_SUPABASE_URL           https://bkgsspvintskiiallxxp.supabase.co
BBI_SUPABASE_KEY           Service role key
BBI_FROM_EMAIL             digest@brazilianbeautyindex.com
```

## Vercel routing gotcha

In `vercel.json`, the rewrite must be:

```json
{ "source": "/blog/:slug", "destination": "/blog/post?slug=:slug" }
```

**Not** `/blog/post.html?slug=:slug` — the `.html` triggers `cleanUrls` to redirect externally and strips the query string. This was the cause of the "Article not found" bug.

## Admin

`brazilianbeautyindex.com/admin`, password `bbi2026`. Requires a GitHub fine-grained PAT with `Contents: write` on this repo to save changes.

## What lives where for content

- `topics.json` — editorial calendar (what we want to write)
- `blog/posts.json` — published articles (what readers see)
- Both files committed to git, both deployed to Vercel as static assets

See `docs/03-content-pipeline.md` in the brand folder for the full content pipeline.
