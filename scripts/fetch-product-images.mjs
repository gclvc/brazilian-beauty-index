#!/usr/bin/env node
/**
 * BBI — Product Image Fetcher
 *
 * Scrapes product images from keratinandcare.com and official brand sites.
 * Assigns hero images to posts in blog/posts.json.
 *
 * Usage:
 *   node scripts/fetch-product-images.mjs           # Process all posts without images
 *   node scripts/fetch-product-images.mjs --dry-run # Preview only
 *   node scripts/fetch-product-images.mjs --slug brae-blonde-repair-review
 *
 * Image sources (priority order):
 *   1. keratinandcare.com (owned — products we sell)
 *   2. Brand official sites (braehaircare.co.uk, etc.)
 *   3. Unsplash API (lifestyle/generic — free commercial use)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir    = path.dirname(fileURLToPath(import.meta.url));
const POSTS    = path.join(__dir, '../blog/posts.json');
const IMG_DIR  = path.join(__dir, '../assets/images/products');
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY; // optional

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const oneSlug = args.includes('--slug') ? args[args.indexOf('--slug')+1] : null;

// ── Brand → search config ─────────────────────────────────────────────────────
const BRAND_CONFIG = {
  brae: {
    site: 'https://braehaircare.co.uk',
    searchPath: '/collections/all',
    keywords: ['braé','brae hair care','blonde repair','revival','bond angel','divine','essential'],
  },
  cadiveu: {
    site: 'https://keratinandcare.com',
    searchPath: '/collections/cadiveu',
    keywords: ['cadiveu','brasil cacau','plastica dos fios'],
  },
  honma: {
    site: 'https://keratinandcare.com',
    searchPath: '/collections/honma-tokyo',
    keywords: ['honma tokyo','h-brush','coffee premium'],
  },
  piur: {
    site: 'https://keratinandcare.com',
    searchPath: '/collections/piur',
    keywords: ['piur','nano keratin'],
  },
  salvatore: {
    site: 'https://keratinandcare.com',
    searchPath: '/collections/salvatore',
    keywords: ['salvatore','taninoterapy','blue gold'],
  },
  tanino: {
    site: 'https://keratinandcare.com',
    searchPath: '/collections/tanino',
    keywords: ['tanino therapy'],
  },
  robson: {
    site: 'https://keratinandcare.com',
    searchPath: '/collections/robson',
    keywords: ['robson peluquero'],
  },
  lavi: {
    site: 'https://keratinandcare.com',
    searchPath: '/collections/lavi',
    keywords: ['lavi'],
  },
};

// ── Unsplash fallback queries by category ─────────────────────────────────────
const UNSPLASH_QUERIES = {
  'hair-care': 'professional hair salon treatment',
  'hair':      'hair salon professional treatment',
  'ingredients': 'amazon rainforest botanical beauty',
  'distribution': 'professional beauty products warehouse',
  'skincare':  'skincare serum luxury',
  'nails':     'nail art professional salon',
  'makeup':    'professional makeup beauty',
  'body':      'luxury body care spa',
  'wellness':  'spa wellness beauty ritual',
};

// ── Detect brand from post ────────────────────────────────────────────────────
function detectBrand(post) {
  const text = (post.title + ' ' + post.keyword + ' ' + (post.tags||[]).join(' ')).toLowerCase();
  if (text.includes('braé') || text.includes('brae')) return 'brae';
  if (text.includes('cadiveu')) return 'cadiveu';
  if (text.includes('honma')) return 'honma';
  if (text.includes('piur')) return 'piur';
  if (text.includes('salvatore') || text.includes('taninoterapi')) return 'salvatore';
  if (text.includes('tanino')) return 'tanino';
  if (text.includes('robson')) return 'robson';
  if (text.includes('lavi')) return 'lavi';
  return null;
}

// ── Fetch image from Shopify collection page ─────────────────────────────────
async function fetchShopifyImage(brand, post) {
  const config = BRAND_CONFIG[brand];
  if (!config) return null;

  try {
    const url = config.site + config.searchPath + '.json?limit=50';
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 BrazilianBeautyIndex/1.0' },
    });
    if (!r.ok) return null;

    const data = await r.json();
    const products = data.products || [];

    // Find product matching post keywords
    const postText = (post.title + ' ' + post.keyword).toLowerCase();
    for (const product of products) {
      const productName = (product.title + ' ' + (product.tags||[]).join(' ')).toLowerCase();
      // Check if any keyword from the brand config matches
      const match = config.keywords.some(kw =>
        postText.includes(kw.toLowerCase()) && productName.includes(kw.toLowerCase())
      );
      if (match && product.images?.length > 0) {
        return product.images[0].src.replace(/\?.*$/, '') + '?width=800&format=jpg';
      }
    }

    // Fallback: return first product image from the collection
    if (products.length > 0 && products[0].images?.length > 0) {
      return products[0].images[0].src.replace(/\?.*$/, '') + '?width=800&format=jpg';
    }
  } catch (err) {
    console.warn(`  ⚠️  Shopify fetch failed for ${brand}: ${err.message}`);
  }
  return null;
}

// ── Fetch from Unsplash ────────────────────────────────────────────────────────
async function fetchUnsplashImage(post) {
  if (!UNSPLASH_KEY) return null;

  const query = UNSPLASH_QUERIES[post.category] || 'professional beauty hair care';
  try {
    const r = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const photo = data.results?.[0];
    if (!photo) return null;
    return {
      url: photo.urls.regular,
      credit: `Photo by ${photo.user.name} on Unsplash`,
      credit_url: `${photo.links.html}?utm_source=brazilianbeautyindex&utm_medium=referral`,
    };
  } catch (err) {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const posts = JSON.parse(readFileSync(POSTS, 'utf8'));

  const targets = oneSlug
    ? posts.filter(p => p.slug === oneSlug)
    : posts.filter(p => !p.featured_image);

  console.log(`\n🖼️  Processing ${targets.length} posts without images...\n`);

  if (!existsSync(IMG_DIR)) mkdirSync(IMG_DIR, { recursive: true });

  let updated = 0;
  for (const post of targets) {
    process.stdout.write(`  [${post.slug.slice(0,40)}] `);

    if (dryRun) { console.log('DRY RUN'); continue; }

    const brand = detectBrand(post);
    let imageUrl = null;
    let imageCredit = null;

    // Try brand/Shopify first
    if (brand) {
      imageUrl = await fetchShopifyImage(brand, post);
      if (imageUrl) {
        imageCredit = `© ${BRAND_CONFIG[brand]?.site?.replace('https://','') || brand}`;
      }
    }

    // Fallback to Unsplash
    if (!imageUrl) {
      const unsplash = await fetchUnsplashImage(post);
      if (unsplash) {
        imageUrl = unsplash.url;
        imageCredit = unsplash.credit;
      }
    }

    // Fallback: use a branded gradient placeholder URL
    if (!imageUrl) {
      imageUrl = null; // post.html handles missing images gracefully
    }

    if (imageUrl) {
      post.featured_image = imageUrl;
      if (imageCredit) post.image_credit = imageCredit;
      updated++;
      console.log(`✅ ${brand || 'unsplash'}`);
    } else {
      console.log(`⏭️  no image found`);
    }

    await new Promise(r => setTimeout(r, 500)); // polite rate limit
  }

  writeFileSync(POSTS, JSON.stringify(posts, null, 2));
  console.log(`\n✅ Updated ${updated}/${targets.length} posts with images.`);
  console.log(`\nNext: git add blog/posts.json && git commit -m "feat: add product images" && git push`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
