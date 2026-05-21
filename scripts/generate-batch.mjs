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
// ── Site monetization map ─────────────────────────────────────────────────────
// Used to inject the right CTA links per article type
const SITE_MAP = {
  brae: {
    buy:  'https://braehaircare.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',
    b2b:  'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',
    name_buy: 'Braé Hair Care UK',
    name_b2b: 'BM Supplier',
  },
  cadiveu:   { buy: 'https://keratinandcare.com?utm_source=bbi&utm_medium=blog&utm_campaign=', b2b: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=', name_buy: 'Keratin and Care', name_b2b: 'BM Supplier' },
  honma:     { buy: 'https://keratinandcare.com?utm_source=bbi&utm_medium=blog&utm_campaign=', b2b: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=', name_buy: 'Keratin and Care', name_b2b: 'BM Supplier' },
  piur:      { buy: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  b2b: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  name_buy: 'BM Supplier', name_b2b: 'BM Supplier' },
  lavi:      { buy: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  b2b: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  name_buy: 'BM Supplier', name_b2b: 'BM Supplier' },
  salvatore: { buy: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  b2b: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  name_buy: 'BM Supplier', name_b2b: 'BM Supplier' },
  tanino:    { buy: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  b2b: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  name_buy: 'BM Supplier', name_b2b: 'BM Supplier' },
  robson:    { buy: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  b2b: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  name_buy: 'BM Supplier', name_b2b: 'BM Supplier' },
  default:   { buy: 'https://keratinandcare.com?utm_source=bbi&utm_medium=blog&utm_campaign=', b2b: 'https://bmsupplier.co.uk?utm_source=bbi&utm_medium=blog&utm_campaign=',  name_buy: 'Keratin and Care', name_b2b: 'BM Supplier' },
};

function getSiteLinks(topic) {
  const kw = (topic.keyword + ' ' + topic.title).toLowerCase();
  let brand = 'default';
  if (kw.includes('braé') || kw.includes('brae')) brand = 'brae';
  else if (kw.includes('cadiveu')) brand = 'cadiveu';
  else if (kw.includes('honma')) brand = 'honma';
  else if (kw.includes('piur')) brand = 'piur';
  else if (kw.includes('lavi')) brand = 'lavi';
  else if (kw.includes('salvatore')) brand = 'salvatore';
  else if (kw.includes('tanino')) brand = 'tanino';
  else if (kw.includes('robson')) brand = 'robson';
  const s = SITE_MAP[brand];
  const slug = topic.slug || 'article';
  return {
    buyUrl:  s.buy  + slug,
    b2bUrl:  s.b2b  + slug,
    buyName: s.name_buy,
    b2bName: s.name_b2b,
    isPro: kw.includes('salon') || kw.includes('distribut') || kw.includes('professional') || kw.includes('import'),
  };
}

const SYSTEM = `You are a senior editor at Brazilian Beauty Index — the definitive English-language reference for Brazilian beauty. You write for salon professionals, beauty distributors and beauty enthusiasts in the UK and Europe.

WRITING STYLE — ANTI-AI MANDATORY:
- Write like an experienced trade journalist, not like an AI generating content
- Vary sentence length dramatically. Use fragments intentionally.
- Start 20–30% of sentences with "But", "And", "So", "Because", "Yet", "That's"
- NEVER use: "comprehensive", "robust", "cutting-edge", "leverage", "seamlessly", "Furthermore", "Moreover", "Additionally" as fillers, "In conclusion", "To summarise", "It's worth noting", "delve", "explore", "In the world of [topic]"
- Include one specific concrete detail per section (real price range, real country, real product name, real timeframe)
- State opinions directly: "This is the stronger option", "Most salons get this wrong"
- Vary paragraph length: some 1 sentence, some 4 sentences. Never uniform
- End without restating everything. Close with a forward-looking sentence

AI SEARCH OPTIMIZATION (Perplexity, ChatGPT, Claude, Google AI Overviews):
- First paragraph answers the keyword query directly in 2 sentences — this becomes the AI snippet
- Each H2 section starts with a direct, citable factual statement
- FAQ section: 4+ questions with direct 1-2 sentence answers (critical for AI citations)
- Use HTML comparison tables where relevant: <table><thead>...</thead><tbody>...</tbody></table>
- Include numbered AND bulleted lists per article

CONTENT RULES:
- Focus on Brazilian beauty: hair care, skincare, nails, makeup, body, wellness, ingredients
- Be specific: brands, product names, treatment durations, price ranges, regulations
- Include at least one FAQ section (H2: Frequently Asked Questions) with 4 real questions
- Target the primary keyword naturally throughout
- Add 2-3 internal blog links using: <a href="/blog/[related-slug]">[anchor text]</a>
  Related slugs to link: cadiveu-professional-guide, brae-hair-care-complete-guide,
  honma-tokyo-brand-guide, brazilian-keratin-treatment-guide-2026,
  keratin-treatment-vs-brazilian-blowout, how-long-does-keratin-treatment-last,
  what-is-hair-botox, damaged-hair-recovery-brazilian
- Word count: 1000–1400 words

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
        content: `Write a full editorial article for Brazilian Beauty Index.

Title: "${topic.title}"
Primary keyword: "${topic.keyword}"
Category: ${topic.category}
Tier: ${topic.tier} (${topic.tier === 1 ? 'brand-specific' : topic.tier === 2 ? 'category/general' : 'how-to/comparison'})

LINK REQUIREMENTS FOR THIS ARTICLE:
${getSiteLinks(topic).isPro
  ? `- This is a professional/salon/distributor article. Include a CTA linking to: <a href="${getSiteLinks(topic).b2bUrl}">${getSiteLinks(topic).b2bName}</a> for professional accounts or distribution.
- Also link to: <a href="https://pro.keratinandcare.com?utm_source=bbi&utm_medium=blog&utm_campaign=${topic.slug}">Keratin and Care Professional</a> for salon registration.`
  : `- Include a natural CTA linking to: <a href="${getSiteLinks(topic).buyUrl}">${getSiteLinks(topic).buyName}</a> where readers can buy/stock these products.
- Also reference: <a href="${getSiteLinks(topic).b2bUrl}">${getSiteLinks(topic).b2bName}</a> for professional/wholesale accounts.`
}
- All links must feel 100% editorial and natural — never forced sales pitches.

Remember: anti-AI writing style mandatory. 1000-1400 words. Include FAQ section with 4 questions.`,
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
