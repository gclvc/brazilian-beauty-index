#!/usr/bin/env node
/**
 * BBI — Unsplash Image Fetcher v3
 *
 * Fetches unique, content-relevant images from Unsplash API for each post.
 * - Keeps existing K&C product photos (keratinandcare.com) untouched
 * - Replaces repeated/generic Unsplash static fallbacks with search results
 * - Guarantees no duplicate photo IDs across posts
 * - Credits photographer: "Photo by {name} on Unsplash"
 *
 * Usage:
 *   UNSPLASH_KEY=your_access_key node scripts/fetch-unsplash-images.mjs
 *   UNSPLASH_KEY=xxx node scripts/fetch-unsplash-images.mjs --dry-run
 *   UNSPLASH_KEY=xxx node scripts/fetch-unsplash-images.mjs --force     # re-process all
 *   UNSPLASH_KEY=xxx node scripts/fetch-unsplash-images.mjs --slug xyz  # single post
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const POSTS  = path.join(__dir, '../blog/posts.json');

const UNSPLASH_KEY = process.env.UNSPLASH_KEY;
if (!UNSPLASH_KEY) {
  console.error('[ERROR] Missing UNSPLASH_KEY environment variable.');
  console.error('  Get a free key at https://unsplash.com/developers');
  console.error('  Then run: UNSPLASH_KEY=your_key node scripts/fetch-unsplash-images.mjs');
  process.exit(1);
}

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const force   = args.includes('--force');
const oneSlug = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;

// ── Static Unsplash fallback URLs we know are repeated/generic ────────────────
const GENERIC_UNSPLASH = new Set([
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80',
  'https://images.unsplash.com/photo-1607621932846-f1754289c7af?w=800&q=80',
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80',
  'https://images.unsplash.com/photo-1487412912498-0447578fcca8?w=800&q=80',
  'https://images.unsplash.com/photo-1519415387722-a68073d80f5a?w=800&q=80',
  'https://images.unsplash.com/photo-1580618864194-1e02b09c8543?w=800&q=80',
  'https://images.unsplash.com/photo-1586880244386-8b3e34c8382c?w=800&q=80',
]);

// ── Build search queries per post (primary + 2 fallbacks) ────────────────────
function buildQueries(post) {
  const title   = post.title   || '';
  const keyword = post.keyword || '';
  const cat     = post.category || '';
  const base    = keyword || title;

  // Primary: content-specific
  let primary;
  if (/keratin|smoothing|blowout|straighten/i.test(base))     primary = `${base} hair salon`;
  else if (/blonde|color|colour|highlight/i.test(base))        primary = `${base} hair colour`;
  else if (/curl|wavy|frizz/i.test(base))                      primary = `${base} curly hair`;
  else if (/damaged|repair|recovery|broken/i.test(base))       primary = `${base} hair treatment`;
  else if (/ingredient|botanical|amazon|açaí|acai|buriti|cupuaçu|cupuacu/i.test(base)) primary = `${base} botanical beauty`;
  else if (/salon|stylist|professional|hairdresser/i.test(base)) primary = `${base} hair salon`;
  else if (/import|distribut|wholesale|supplier|cpnp/i.test(base)) primary = 'beauty professional cosmetics';
  else if (/oil|mask|serum|shampoo|conditioner/i.test(base))   primary = `${base} hair care`;
  else if (/formaldehyde|chemical|molecule|science/i.test(base)) primary = 'hair chemistry laboratory beauty';
  else if (/skin|face|glow|moisture/i.test(cat))               primary = `${base} skincare beauty`;
  else primary = `${base} hair salon`;

  // Fallback 1: simpler 2-word query
  const simple = (() => {
    if (/keratin|smoothing|blowout|straighten/i.test(base)) return 'hair salon treatment';
    if (/curl|wavy|frizz/i.test(base))                      return 'curly hair woman';
    if (/botanical|ingredient|acai|buriti|cupuacu/i.test(base)) return 'beauty botanical plant';
    if (/import|distribut|cpnp/i.test(base))                return 'beauty cosmetics professional';
    if (/formaldehyde|molecule|science/i.test(base))         return 'hair care beauty';
    if (/london|uk|europe|portugal/i.test(base))             return 'hair salon london';
    return 'hair salon woman';
  })();

  // Fallback 2: generic but on-brand
  const generic = cat === 'Skin Care' ? 'skincare beauty routine' : 'professional hair care beauty';

  return [primary, simple, generic];
}

// ── Unsplash search ───────────────────────────────────────────────────────────
const usedPhotoIds = new Set();

async function searchUnsplash(queries) {
  for (const query of (Array.isArray(queries) ? queries : [queries])) {
    const url = new URL('https://api.unsplash.com/photos/random');
    url.searchParams.set('query', query);
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('content_filter', 'high');
    url.searchParams.set('count', '10');

    const r = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_KEY}`,
        'Accept-Version': 'v1',
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (r.status === 403) {
      const msg = await r.text();
      throw new Error(`Unsplash HTTP 403: ${msg.slice(0, 120)}`);
    }
    if (r.status === 404) {
      // No results — try next query in fallback chain
      await r.text();
      continue;
    }
    if (!r.ok) {
      const msg = await r.text();
      throw new Error(`Unsplash HTTP ${r.status}: ${msg.slice(0, 120)}`);
    }

    const photos = await r.json();
    if (!Array.isArray(photos) || photos.length === 0) continue;

    const fresh = photos.find(ph => !usedPhotoIds.has(ph.id));
    const photo  = fresh || photos[0];
    usedPhotoIds.add(photo.id);

    return {
      url:          photo.urls.regular,
      credit:       `Photo by ${photo.user.name} on Unsplash`,
      photographer: photo.user.name,
      unsplash_id:  photo.id,
    };
  }
  return null; // all queries exhausted
}

// ── Should we replace this post's image? ─────────────────────────────────────
function needsNewImage(post) {
  if (force) return true;
  if (!post.featured_image) return true;
  // Replace if it's one of the known generic/repeated static URLs
  if (GENERIC_UNSPLASH.has(post.featured_image)) return true;
  // Replace catalog PDF pages (text-heavy scans, not clean hero images).
  // Kept in needsNewImage so future catalog-backed posts get auto-replaced.
  if (post.featured_image.startsWith('/assets/brands/')) return true;
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const posts = JSON.parse(readFileSync(POSTS, 'utf8'));

  // Pre-seed usedPhotoIds from posts that already have unique Unsplash images
  posts.forEach(p => {
    if (p.unsplash_id) usedPhotoIds.add(p.unsplash_id);
    // Extract photo ID from existing non-generic Unsplash URLs
    if (p.featured_image && p.featured_image.includes('unsplash.com')) {
      const m = p.featured_image.match(/photo-([a-zA-Z0-9_-]+)/);
      if (m) usedPhotoIds.add(m[1]);
    }
  });

  let targets;
  if (oneSlug) {
    targets = posts.filter(p => p.slug === oneSlug);
    if (!targets.length) { console.error('No post:', oneSlug); process.exit(1); }
  } else {
    targets = posts.filter(p => needsNewImage(p));
  }

  console.log(`\nBBI Unsplash Image Fetcher v3`);
  console.log(`API key: ${UNSPLASH_KEY.slice(0,6)}...`);
  console.log(`Posts to update: ${targets.length}${force ? ' (--force)' : ''}`);
  if (dryRun) console.log('[DRY RUN — no writes]\n');
  else console.log('');

  let updated = 0, failed = 0;

  for (const post of targets) {
    const label   = post.slug.slice(0, 50).padEnd(50);
    const queries = buildQueries(post);

    if (dryRun) {
      console.log(`  ${label}  queries=${JSON.stringify(queries[0])}`);
      continue;
    }

    try {
      const img = await searchUnsplash(queries);
      if (!img) { console.log(`  [SKIP]    ${label}  no results`); failed++; continue; }

      post.featured_image = img.url;
      post.image_credit   = img.credit;
      post.unsplash_id    = img.unsplash_id;

      console.log(`  [OK]      ${label}  by ${img.photographer}`);
      updated++;
    } catch (err) {
      console.warn(`  [FAIL]    ${label}  ${err.message}`);
      failed++;
    }

    // Rate limit: Unsplash demo = 50 req/hour → ~1.4 req/sec max
    // We're using count=10 so 1 req per post → safe at 600ms/post
    await new Promise(r => setTimeout(r, 600));
  }

  if (!dryRun) {
    writeFileSync(POSTS, JSON.stringify(posts, null, 2));
    console.log(`\n--- Summary ---`);
    console.log(`  Updated : ${updated}`);
    console.log(`  Failed  : ${failed}`);
    console.log(`  Total   : ${targets.length}`);
    console.log(`\nNext: git add blog/posts.json && git commit -m "feat: unique Unsplash images for all posts" && git push`);
  }
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
