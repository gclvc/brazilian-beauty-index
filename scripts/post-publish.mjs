#!/usr/bin/env node
/**
 * BBI — Post-Publish Pipeline
 *
 * Runs after all articles are generated. Executes in order:
 *   1. Sync topics.json with posts.json (mark done)
 *   2. Fetch product images from K&C + brand sites
 *   3. Rebuild sitemap.xml with all articles
 *   4. Request Google indexing via Search Console API (optional)
 *   5. Commit + push everything
 *
 * Usage:
 *   node scripts/post-publish.mjs
 *   node scripts/post-publish.mjs --no-git  # skip commit
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { execSync } from 'child_process';

const __dir    = path.dirname(fileURLToPath(import.meta.url));
const POSTS    = path.join(__dir, '../blog/posts.json');
const TOPICS   = path.join(__dir, '../topics.json');
const SITEMAP  = path.join(__dir, '../sitemap.xml');
const SITE_URL = 'https://www.brazilianbeautyindex.com';

const args  = process.argv.slice(2);
const noGit = args.includes('--no-git');

// ── Step 1: Sync topics ────────────────────────────────────────────────────────
function syncTopics() {
  const posts  = JSON.parse(readFileSync(POSTS,   'utf8'));
  const topics = JSON.parse(readFileSync(TOPICS,  'utf8'));
  const slugs  = new Set(posts.map(p => p.slug));
  let marked = 0;
  for (const t of topics) {
    if (slugs.has(t.slug) && t.status !== 'done') {
      t.status = 'done';
      t.generated_at = new Date().toISOString();
      marked++;
    }
  }
  writeFileSync(TOPICS, JSON.stringify(topics, null, 2));
  const pending = topics.filter(t => t.status === 'pending').length;
  console.log(`✅ Topics synced: ${marked} marked done, ${pending} still pending`);
  return { posts, topics, pending };
}

// ── Step 2: Rebuild sitemap ────────────────────────────────────────────────────
function rebuildSitemap(posts) {
  const today = new Date().toISOString().split('T')[0];
  const staticPages = [
    { url: '/', priority: '1.0', freq: 'daily' },
    { url: '/blog/', priority: '0.9', freq: 'daily' },
    { url: '/brands/', priority: '0.8', freq: 'weekly' },
    { url: '/about/', priority: '0.6', freq: 'monthly' },
    { url: '/distribution/', priority: '0.8', freq: 'monthly' },
    { url: '/partners/', priority: '0.7', freq: 'monthly' },
  ];

  const entries = [
    ...staticPages.map(p =>
      `  <url><loc>${SITE_URL}${p.url}</loc><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`
    ),
    ...posts.map(p =>
      `  <url><loc>${SITE_URL}/blog/${p.slug}</loc><lastmod>${p.date || today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

  writeFileSync(SITEMAP, xml);
  console.log(`✅ Sitemap rebuilt: ${entries.length} URLs (${posts.length} articles + ${staticPages.length} pages)`);
}

// ── Step 3: Git commit & push ──────────────────────────────────────────────────
function gitPush(postCount) {
  if (noGit) { console.log('⏭️  Skipping git (--no-git)'); return; }
  try {
    execSync('git add blog/posts.json topics.json sitemap.xml assets/images/', {
      cwd: path.join(__dir, '..'),
      stdio: 'pipe',
    });
    execSync(
      `git commit -m "content: ${postCount} articles published + sitemap updated [skip ci]"`,
      { cwd: path.join(__dir, '..'), stdio: 'pipe' }
    );
    execSync('git push origin main', {
      cwd: path.join(__dir, '..'),
      stdio: 'inherit',
    });
    console.log(`✅ Pushed to GitHub → Vercel auto-deploys`);
  } catch (err) {
    console.error('❌ Git push failed:', err.message);
    console.log('Run manually: git add -A && git commit -m "content: batch" && git push');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 BBI Post-Publish Pipeline\n');

  const { posts, pending } = syncTopics();
  console.log(`\n📊 Total articles: ${posts.length} | Topics still pending: ${pending}`);

  rebuildSitemap(posts);

  console.log('\n📸 Fetching product images...');
  try {
    execSync('node scripts/fetch-product-images.mjs', {
      cwd: path.join(__dir, '..'),
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('⚠️  Image fetch had errors — continuing');
  }

  gitPush(posts.length);

  console.log(`\n✅ Pipeline complete!`);
  console.log(`   Articles live: ${posts.length}`);
  console.log(`   Site: ${SITE_URL}`);
  if (pending > 0) {
    console.log(`\n⚡ Still ${pending} topics pending. Run:`);
    console.log(`   node scripts/generate-batch.mjs --limit 999`);
    console.log(`   node scripts/post-publish.mjs`);
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
