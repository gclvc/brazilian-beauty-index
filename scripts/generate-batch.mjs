#!/usr/bin/env node
/**
 * Brazilian Beauty Index — Batch Article Generator
 *
 * Reads topics.json and generates articles for all "pending" topics.
 * Each article is appended to blog/posts.json and topics.json is updated.
 *
 * Usage:
 *   node scripts/generate-batch.mjs              # Generate all pending
 *   node scripts/generate-batch.mjs --limit 5    # Generate next 5
 *   node scripts/generate-batch.mjs --tier 1     # Only tier 1
 *   node scripts/generate-batch.mjs --dry-run    # Show what would be generated
 *
 * Requires: ANTHROPIC_API_KEY
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir   = path.dirname(fileURLToPath(import.meta.url));
const TOPICS  = path.join(__dir, '../topics.json');
const POSTS   = path.join(__dir, '../blog/posts.json');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error('❌  ANTHROPIC_API_KEY not set'); process.exit(1); }

// ── CLI args ──────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const limit    = args.includes('--limit')   ? parseInt(args[args.indexOf('--limit')+1])   : Infinity;
const tierOnly = args.includes('--tier')    ? parseInt(args[args.indexOf('--tier')+1])    : null;
const dryRun   = args.includes('--dry-run');

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM = `You are a senior editor at Brazilian Beauty Index — the definitive English-language reference for Brazilian beauty. You write for salon professionals, beauty distributors and beauty enthusiasts in the UK and Europe.

WRITING STYLE — ANTI-AI MANDATORY:
- Write like an experienced trade journalist, not like an AI generating content
- Vary sentence length dramatically. Use fragments intentionally.
- Start 20–30% of sentences with "But", "And", "So", "Because", "Yet", "That's"
- NEVER use: "comprehensive", "robust", "cutting-edge", "leverage", "seamlessly", "Furthermore", "Moreover", "Additionally" as fillers, "In conclusion", "To summarise", "It's worth noting", "It's important to remember", "delve", "explore", "In the world of [topic]"
- Include one specific concrete detail per section (real country, real regulation, real product name, real price range, real timeframe)
- State opinions directly: "This is the stronger option", "Most salons get this wrong"
- Vary paragraph length: some 1 sentence, some 4 sentences. Never uniform
- End without restating everything. Close with a forward-looking sentence

CONTENT RULES:
- Focus on Brazilian beauty: hair care, skincare, nails, makeup, body, wellness, ingredients
- Be specific about brands, products, regulations, markets (EU, UK, Brazil)
- Include at least one FAQ section (H2: Frequently Asked Questions) with 3-4 real questions
- Target the primary keyword naturally throughout the article
- Internal link suggestion: mention 1-2 related articles that could be linked
- Word count: 900–1400 words

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "title": "Exact article title (max 80 chars)",
  "seo_title": "SEO title with keyword | Brazilian Beauty Index",
  "seo_description": "Meta description 130-155 chars with primary keyword",
  "excerpt": "2 compelling sentences for card display",
  "category": "hair|skincare|nails|makeup|body|wellness|distribution|ingredients",
  "tags": ["tag1", "tag2", "tag3"],
  "content": "<h2>Section</h2><p>...</p>"
}`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function generateArticle(topic) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-5',
      max_tokens: 4096,
      system:     SYSTEM,
      messages: [{
        role:    'user',
        content: `Write a full editorial article for Brazilian Beauty Index.\n\nTitle: "${topic.title}"\nPrimary keyword: "${topic.keyword}"\nCategory: ${topic.category}\n\nRemember: anti-AI writing style mandatory. 900-1400 words. Include FAQ section.`,
      }],
    }),
  });

  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const text = data.content[0].text.trim();

  let post;
  try { post = JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Could not parse JSON');
    post = JSON.parse(m[0]);
  }
  return post;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const topics = JSON.parse(readFileSync(TOPICS, 'utf8'));
  const posts  = JSON.parse(readFileSync(POSTS, 'utf8'));

  const pending = topics.filter(t =>
    t.status === 'pending' &&
    (tierOnly === null || t.tier === tierOnly)
  ).sort((a, b) => a.priority - b.priority || a.id - b.id);

  const toGenerate = pending.slice(0, limit);

  if (toGenerate.length === 0) {
    console.log('✅  No pending topics to generate.');
    return;
  }

  console.log(`\n📋  Found ${pending.length} pending topics. Generating ${toGenerate.length}...\n`);

  if (dryRun) {
    console.log('DRY RUN — articles that would be generated:');
    toGenerate.forEach(t => console.log(`  [T${t.tier}] ${t.title}`));
    return;
  }

  let generated = 0;
  for (const topic of toGenerate) {
    console.log(`\n[${generated+1}/${toGenerate.length}] Generating: "${topic.title}"`);
    try {
      const article = await generateArticle(topic);

      const postEntry = {
        slug:            topic.slug,
        title:           article.title  || topic.title,
        seo_title:       article.seo_title,
        seo_description: article.seo_description,
        excerpt:         article.excerpt,
        category:        article.category || topic.category,
        date:            new Date().toISOString().split('T')[0],
        tags:            article.tags || [topic.keyword],
        author:          'BBI Editorial',
        tier:            topic.tier,
        keyword:         topic.keyword,
        content:         article.content,
      };

      // Prepend to posts (newest first), skip if slug already exists
      if (!posts.find(p => p.slug === postEntry.slug)) {
        posts.unshift(postEntry);
      }

      // Mark topic as done
      topic.status = 'done';
      topic.generated_at = new Date().toISOString();

      // Save after every article (safe against crashes)
      writeFileSync(POSTS,   JSON.stringify(posts, null, 2));
      writeFileSync(TOPICS,  JSON.stringify(topics, null, 2));

      generated++;
      console.log(`   ✅  Done — /blog/${postEntry.slug}`);

      // Rate limit: 1 request per 3s to stay well within limits
      if (generated < toGenerate.length) await sleep(3000);

    } catch (err) {
      console.error(`   ❌  Failed: ${err.message}`);
      topic.status = 'error';
      topic.error  = err.message;
      writeFileSync(TOPICS, JSON.stringify(topics, null, 2));
    }
  }

  console.log(`\n✅  Generated ${generated}/${toGenerate.length} articles.`);
  console.log(`📝  ${posts.length} total articles in posts.json`);
  console.log(`\nNext: git add . && git commit -m "content: batch generation" && git push`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
