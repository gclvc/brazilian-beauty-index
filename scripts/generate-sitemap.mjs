#!/usr/bin/env node
/**
 * BBI — Sitemap Generator
 *
 * Rebuilds sitemap.xml from blog/posts.json so every published article
 * is discoverable by crawlers. Replaces ad-hoc sitemap edits that drift
 * out of sync with posts.json.
 *
 * Behaviour:
 *   - Reads blog/posts.json (source of truth for blog content)
 *   - Emits one <url> per post: loc = /blog/{slug}, lastmod = post.date
 *   - Tier-based priority: tier 1 → 0.8, tier 2 → 0.6, tier 3 → 0.5
 *   - changefreq = monthly for all blog posts
 *   - Includes hand-curated static pages (home, blog, brands, hair, etc.)
 *   - Sorts all <url> entries by lastmod DESC (static pages first — no lastmod)
 *   - Validates XML before writing
 *
 * Usage:
 *   node scripts/generate-sitemap.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir    = path.dirname(fileURLToPath(import.meta.url));
const POSTS    = path.join(__dir, '../blog/posts.json');
const SITEMAP  = path.join(__dir, '../sitemap.xml');
const SITE_URL = 'https://www.brazilianbeautyindex.com';

// ── Static pages (only those that physically exist as index.html) ──────────────
const STATIC_PAGES = [
  { url: '/',              priority: '1.0', freq: 'daily'   },
  { url: '/blog/',         priority: '0.9', freq: 'daily'   },
  { url: '/best-of/',      priority: '0.9', freq: 'weekly'  },
  { url: '/brands/',       priority: '0.8', freq: 'weekly'  },
  { url: '/hair/',         priority: '0.8', freq: 'weekly'  },
  { url: '/skin/',         priority: '0.7', freq: 'weekly'  },
  { url: '/body/',         priority: '0.7', freq: 'weekly'  },
  { url: '/makeup/',       priority: '0.7', freq: 'weekly'  },
  { url: '/nails/',        priority: '0.7', freq: 'weekly'  },
  { url: '/wellness/',     priority: '0.7', freq: 'weekly'  },
  { url: '/tools/',        priority: '0.7', freq: 'weekly'  },
  { url: '/quiz/',         priority: '0.7', freq: 'weekly'  },
  { url: '/distribution/', priority: '0.8', freq: 'monthly' },
  { url: '/partners/',     priority: '0.7', freq: 'monthly' },
  { url: '/advertise/',    priority: '0.6', freq: 'monthly' },
  { url: '/about/',        priority: '0.6', freq: 'monthly' },
  // Author pages (E-E-A-T hub)
  { url: '/authors/',                    priority: '0.6', freq: 'monthly' },
  { url: '/authors/camila-ferreira/',    priority: '0.5', freq: 'monthly' },
  { url: '/authors/sofia-almeida/',      priority: '0.5', freq: 'monthly' },
  { url: '/authors/rachel-okonkwo/',     priority: '0.5', freq: 'monthly' },
  { url: '/authors/tomas-costa/',        priority: '0.5', freq: 'monthly' },
  // Legal / trust pages
  { url: '/privacy/',              priority: '0.3', freq: 'yearly'  },
  { url: '/terms/',                priority: '0.3', freq: 'yearly'  },
  { url: '/cookies/',              priority: '0.3', freq: 'yearly'  },
  { url: '/correction-policy/',    priority: '0.3', freq: 'yearly'  },
  { url: '/editorial-standards/',  priority: '0.4', freq: 'yearly'  },
];

// ── Tier → priority map ───────────────────────────────────────────────────────
function priorityForTier(tier) {
  switch (Number(tier)) {
    case 1:  return '0.8';
    case 2:  return '0.6';
    case 3:  return '0.5';
    default: return '0.5';
  }
}

// ── XML escape (loc is a URL, but be defensive) ───────────────────────────────
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Minimal XML well-formedness check (tag-balance + declaration) ─────────────
function validateXml(xml) {
  if (!xml.startsWith('<?xml')) throw new Error('Missing XML declaration');
  if (!xml.includes('<urlset')) throw new Error('Missing <urlset> root');
  if (!xml.trimEnd().endsWith('</urlset>')) throw new Error('Missing </urlset> closer');
  const opens  = (xml.match(/<url>/g)  || []).length;
  const closes = (xml.match(/<\/url>/g) || []).length;
  if (opens !== closes) throw new Error(`Tag imbalance: ${opens} <url> vs ${closes} </url>`);
  if (opens === 0) throw new Error('Zero <url> entries — refusing to write empty sitemap');
  return { urlCount: opens };
}

function main() {
  if (!existsSync(POSTS)) {
    console.error(`posts.json not found at ${POSTS}`);
    process.exit(1);
  }

  const posts = JSON.parse(readFileSync(POSTS, 'utf8'));
  if (!Array.isArray(posts)) {
    console.error('posts.json must be an array');
    process.exit(1);
  }

  const today = new Date().toISOString().split('T')[0];

  // Build blog entries
  const blogEntries = posts
    .filter(p => p && p.slug)
    .map(p => ({
      loc: `${SITE_URL}/blog/${p.slug}`,
      lastmod: p.date || today,
      changefreq: 'monthly',
      priority: priorityForTier(p.tier),
    }));

  // Build static entries (no lastmod)
  const staticEntries = STATIC_PAGES.map(p => ({
    loc: `${SITE_URL}${p.url}`,
    lastmod: null,
    changefreq: p.freq,
    priority: p.priority,
  }));

  // Combine + sort by lastmod DESC; static (null lastmod) bubble to top
  const all = [...staticEntries, ...blogEntries].sort((a, b) => {
    if (a.lastmod === null && b.lastmod === null) return 0;
    if (a.lastmod === null) return -1;
    if (b.lastmod === null) return  1;
    return b.lastmod.localeCompare(a.lastmod);
  });

  const lines = all.map(e => {
    const lastmod = e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : '';
    return `  <url><loc>${xmlEscape(e.loc)}</loc>${lastmod}<changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${lines.join('\n')}
</urlset>
`;

  const { urlCount } = validateXml(xml);
  writeFileSync(SITEMAP, xml);

  // Tier breakdown for quick visibility
  const tierCounts = { 1: 0, 2: 0, 3: 0, other: 0 };
  for (const p of posts) {
    const t = Number(p.tier);
    if (t === 1 || t === 2 || t === 3) tierCounts[t]++; else tierCounts.other++;
  }

  console.log(`Sitemap rebuilt: ${urlCount} URLs`);
  console.log(`  Static pages: ${staticEntries.length}`);
  console.log(`  Blog posts:   ${blogEntries.length} (tier1=${tierCounts[1]} tier2=${tierCounts[2]} tier3=${tierCounts[3]} other=${tierCounts.other})`);
  console.log(`  Written to:   ${SITEMAP}`);
}

main();
