#!/usr/bin/env node
/**
 * BBI — Product Image Fetcher (v2)
 *
 * Fetches product images from keratinandcare.com Shopify collections API.
 * Falls back to curated Unsplash static URLs for non-brand posts.
 *
 * Usage:
 *   node scripts/fetch-product-images.mjs           # Process all posts without images
 *   node scripts/fetch-product-images.mjs --dry-run # Preview only
 *   node scripts/fetch-product-images.mjs --slug brae-blonde-repair-review
 *   node scripts/fetch-product-images.mjs --force   # Re-process posts that already have images
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const POSTS  = path.join(__dir, '../blog/posts.json');

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const force   = args.includes('--force');
const oneSlug = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;

// ── Brand → Shopify collection handle ────────────────────────────────────────
const BRAND_COLLECTIONS = {
  brae:      'brae',
  cadiveu:   'cadiveu',
  honma:     'honma-tokyo',
  piur:      'piur',
  salvatore: 'salvatore',
  tanino:    'straightening',
  robson:    'robson-peluquero',
  lavi:      'lavi',
  onyx:      'onix',
  inoar:     'inoar',
};

const KNC_BASE = 'https://keratinandcare.com';

// ── Unsplash static fallback images (CC0, no key required) ───────────────────
// Keyed by content-type signal; ordered from most-specific to least-specific.
const UNSPLASH_FALLBACKS = [
  {
    signals: ['keratin treatment', 'smoothing', 'brazilian blowout', 'hair straighten', 'flat iron'],
    url:     'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80',
    label:   'hair-salon',
  },
  {
    signals: ['damaged hair', 'repair', 'recovery', 'breakage', 'restore', 'brittle'],
    url:     'https://images.unsplash.com/photo-1519415387722-a68073d80f5a?w=800&q=80',
    label:   'hair-repair',
  },
  {
    signals: ['blonde', 'color', 'colour', 'highlight', 'lightening', 'bleach'],
    url:     'https://images.unsplash.com/photo-1580618864194-1e02b09c8543?w=800&q=80',
    label:   'blonde-color',
  },
  {
    signals: ['curly hair', 'curls', 'curl', 'wavy hair', 'frizz'],
    url:     'https://images.unsplash.com/photo-1487412912498-0447578fcca8?w=800&q=80',
    label:   'curly-hair',
  },
  {
    signals: ['ingredients', 'amazon', 'acai', 'açaí', 'buriti', 'botanical', 'natural', 'plant'],
    url:     'https://images.unsplash.com/photo-1607621932846-f1754289c7af?w=800&q=80',
    label:   'botanicals',
  },
  {
    signals: ['salon', 'professional', 'stylist', 'hairdresser', 'colourist'],
    url:     'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80',
    label:   'salon-professional',
  },
  {
    signals: ['distribution', 'import', 'cpnp', 'wholesale', 'supplier', 'logistics', 'stock'],
    url:     'https://images.unsplash.com/photo-1586880244386-8b3e34c8382c?w=800&q=80',
    label:   'logistics',
  },
];

// Last-resort default
const DEFAULT_UNSPLASH = {
  url:   'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80',
  label: 'hair-beauty-default',
};

// ── Brand detection ───────────────────────────────────────────────────────────
function detectBrand(post) {
  const text = [
    post.title || '',
    post.keyword || '',
    ...(post.tags || []),
  ].join(' ').toLowerCase();

  if (text.includes('braé') || text.includes('brae')) return 'brae';
  if (text.includes('cadiveu') || text.includes('brasil cacau') || text.includes('plastica dos fios') || text.includes('plástica dos fios')) return 'cadiveu';
  if (text.includes('honma')) return 'honma';
  if (text.includes('piur')) return 'piur';
  if (text.includes('salvatore')) return 'salvatore';
  if (text.includes('inoar')) return 'inoar';
  if (text.includes('onyx') || text.includes('onix')) return 'onyx';
  if (text.includes('robson')) return 'robson';
  if (text.includes('lavi')) return 'lavi';
  // tanino last — broad word, only match when nothing else did
  if (text.includes('tanino')) return 'tanino';
  return null;
}

// ── Shopify products API fetch ────────────────────────────────────────────────
// Cache to avoid hitting the same collection URL multiple times per run.
const collectionCache = new Map();

async function fetchCollectionProducts(handle) {
  if (collectionCache.has(handle)) return collectionCache.get(handle);

  const url = `${KNC_BASE}/collections/${handle}/products.json?limit=50`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'BrazilianBeautyIndex/2.0 (image-fetcher; +https://brazilianbeautyindex.com)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.warn(`    [WARN] ${handle}: HTTP ${r.status}`);
      collectionCache.set(handle, []);
      return [];
    }
    const data = await r.json();
    const products = data.products || [];
    collectionCache.set(handle, products);
    return products;
  } catch (err) {
    console.warn(`    [WARN] ${handle}: ${err.message}`);
    collectionCache.set(handle, []);
    return [];
  }
}

// Score how well a product title matches the post keyword/title.
function matchScore(productTitle, postText) {
  const pText  = postText.toLowerCase();
  const pTitle = productTitle.toLowerCase();
  const words  = pTitle.split(/\s+/).filter(w => w.length > 3);
  let score = 0;
  for (const word of words) {
    if (pText.includes(word)) score++;
  }
  return score;
}

async function fetchBrandImage(brand, post) {
  const handle = BRAND_COLLECTIONS[brand];
  if (!handle) return null;

  const products = await fetchCollectionProducts(handle);
  if (products.length === 0) return null;

  const postText = `${post.title} ${post.keyword}`;

  // Score all products, pick the best match that has an image
  let best = null;
  let bestScore = -1;

  for (const product of products) {
    if (!product.images?.length) continue;
    const score = matchScore(product.title, postText);
    if (score > bestScore) {
      bestScore = score;
      best = product;
    }
  }

  // Fall back to first product with an image if nothing scored
  if (!best) {
    best = products.find(p => p.images?.length > 0);
  }

  if (!best) return null;

  // Strip any existing Shopify query params, then add our sizing params
  const rawSrc = best.images[0].src.replace(/\?.*$/, '');
  return rawSrc + '?width=800&format=jpg';
}

// ── Unsplash static fallback ──────────────────────────────────────────────────
function pickUnsplashFallback(post) {
  const text = [
    post.title || '',
    post.keyword || '',
    ...(post.tags || []),
  ].join(' ').toLowerCase();

  for (const entry of UNSPLASH_FALLBACKS) {
    if (entry.signals.some(sig => text.includes(sig))) {
      return entry;
    }
  }
  return DEFAULT_UNSPLASH;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const posts = JSON.parse(readFileSync(POSTS, 'utf8'));

  let targets;
  if (oneSlug) {
    targets = posts.filter(p => p.slug === oneSlug);
    if (targets.length === 0) {
      console.error(`No post found with slug: ${oneSlug}`);
      process.exit(1);
    }
  } else if (force) {
    targets = posts;
  } else {
    targets = posts.filter(p => !p.featured_image);
  }

  console.log(`\nBBI Image Fetcher v2`);
  console.log(`Processing ${targets.length} posts${force ? ' (--force)' : ' without images'}...\n`);

  if (dryRun) {
    console.log('[DRY RUN — no writes]\n');
  }

  let updatedKnc       = 0;
  let updatedUnsplash  = 0;
  let skipped          = 0;

  for (const post of targets) {
    const label = post.slug.slice(0, 50).padEnd(50);
    const brand = detectBrand(post);

    let imageUrl    = null;
    let imageCredit = null;
    let source      = null;

    // 1. Try K&C Shopify collection
    if (brand) {
      try {
        imageUrl = await fetchBrandImage(brand, post);
        if (imageUrl) {
          imageCredit = 'Product image © keratinandcare.com';
          source = `knc:${brand}`;
        }
      } catch (err) {
        console.warn(`    [WARN] brand fetch error for ${post.slug}: ${err.message}`);
      }
    }

    // 2. Unsplash static fallback
    if (!imageUrl) {
      const fallback = pickUnsplashFallback(post);
      imageUrl    = fallback.url;
      imageCredit = 'Photo via Unsplash (CC0)';
      source      = `unsplash:${fallback.label}`;
    }

    if (dryRun) {
      console.log(`  ${label}  brand=${brand || 'none'}  -> ${source}`);
      continue;
    }

    post.featured_image = imageUrl;
    post.image_credit   = imageCredit;

    if (source.startsWith('knc:')) {
      updatedKnc++;
      console.log(`  [OK-KNC]      ${label}  ${source}`);
    } else {
      updatedUnsplash++;
      console.log(`  [OK-UNSPLASH] ${label}  ${source}`);
    }

    // Polite rate-limit: only needed for K&C fetches; Unsplash is static
    if (source.startsWith('knc:')) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  if (!dryRun) {
    writeFileSync(POSTS, JSON.stringify(posts, null, 2));

    const total = updatedKnc + updatedUnsplash;
    console.log(`\n--- Summary ---`);
    console.log(`  Total updated : ${total} / ${targets.length}`);
    console.log(`  K&C images    : ${updatedKnc}`);
    console.log(`  Unsplash      : ${updatedUnsplash}`);
    console.log(`  Skipped       : ${skipped}`);
    console.log(`\nNext: git add blog/posts.json && git commit -m "feat: add product images to all posts" && git push`);
  }
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
