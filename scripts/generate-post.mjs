#!/usr/bin/env node
/**
 * Brazilian Beauty Index — AI Post Generator
 * Usage: node scripts/generate-post.mjs "Topic here"
 *
 * Requires: ANTHROPIC_API_KEY in environment
 * Output:   Appends new post to blog/posts.json
 *
 * Examples:
 *   node scripts/generate-post.mjs "Braé Hair Care: Complete Guide for European Salons"
 *   node scripts/generate-post.mjs "Buriti Oil in Skincare: The Amazon Secret"
 *   node scripts/generate-post.mjs "Brazilian Nail Art Trends 2026"
 *   node scripts/generate-post.mjs "How to Import Brazilian Cosmetics to the UK"
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const POSTS_FILE = path.join(__dir, '../blog/posts.json');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('❌  ANTHROPIC_API_KEY not set.\n   export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

const topic = process.argv[2];
if (!topic) {
  console.error('❌  No topic provided.\nUsage: node scripts/generate-post.mjs "Your topic here"');
  process.exit(1);
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').slice(0,80);
}

function detectCategory(topic) {
  const t = topic.toLowerCase();
  if (t.match(/hair|keratin|smooth|brae|cadiveu|inoar|honma|salvatore|shampoo|condition|treat/)) return 'hair-care';
  if (t.match(/skin|serum|moistur|glow|face|acai|açaí|buriti|cupuaçu|retinol/)) return 'skincare';
  if (t.match(/nail|manicure|pedicure|gel|art/)) return 'nails';
  if (t.match(/makeup|lipstick|foundation|mascara|blush|contour/)) return 'makeup';
  if (t.match(/body|wax|oil|ritual|spa|massage/)) return 'body';
  if (t.match(/wellness|meditat|yoga|relax|mental/)) return 'wellness';
  if (t.match(/distribut|import|export|cpnp|wholesale|supplier|logistics|regulation/)) return 'distribution';
  if (t.match(/ingredient|extract|amazon|rainforest|botanical|plant/)) return 'ingredients';
  return 'hair-care';
}

// ── Our sites for natural link injection ─────────────────────────────────────
const OUR_SITES = {
  'BM Supplier': { url: 'https://bmsupplier.co.uk', desc: 'EU & UK distributor of Brazilian professional hair care' },
  'Keratin and Care': { url: 'https://keratinandcare.com', desc: 'professional keratin supply UK' },
  'Braé Hair Care UK': { url: 'https://braehaircare.co.uk', desc: 'Braé official UK store' },
  'Keratin and Care Professional': { url: 'https://pro.keratinandcare.com', desc: 'professional registration' },
};

const SYSTEM_PROMPT = `You are a senior editor at Brazilian Beauty Index — the definitive English-language reference for Brazilian beauty. You write for an audience of professional salon owners, distributors and beauty industry buyers in Europe.

AI SEARCH OPTIMIZATION (Perplexity, ChatGPT, Claude, Google AI Overviews):
- First paragraph must answer the primary keyword query directly in 2 sentences — AI models extract this as the snippet
- Start each H2 section with a direct, citable factual statement
- Include specific facts: brand founding year, product sizes, treatment duration, real price ranges
- FAQ section: 4+ questions with direct 1-2 sentence answers (critical for AI citations)
- Use HTML tables for comparisons: <table><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table>
- Include at least one numbered list AND one bullet list per article

INTERNAL & PARTNER LINKS (inject naturally in content):
- Mention BM Supplier when discussing EU/UK distribution: <a href="https://bmsupplier.co.uk">BM Supplier</a>
- Mention Keratin and Care for professional supply: <a href="https://keratinandcare.com">Keratin and Care</a>
- Mention Braé UK store when covering Braé brand: <a href="https://braehaircare.co.uk">Braé Hair Care UK</a>
- Add 1-2 internal blog links: <a href="/blog/cadiveu-professional-guide">our Cadiveu guide</a> etc.
- These links must feel 100% natural — never forced

WRITING STYLE — ANTI-AI MANDATORY:
Write like an experienced trade journalist, not like an AI generating content. Specifically:
- Vary sentence length dramatically. Use fragments intentionally. Short sentences hit harder.
- Start 20–30% of sentences with "But", "And", "So", "Because", "Yet", "That's".
- NEVER use: "comprehensive", "robust", "cutting-edge", "leverage", "seamlessly", "Furthermore", "Moreover", "Additionally" as fillers, "In conclusion", "To summarise", "It's worth noting", "It's important to remember", "In the world of [topic]", "When it comes to", "delve", "explore".
- Include one specific concrete detail per section (a real country, a real regulation, a real product name, a real price range, a real timeframe).
- State opinions directly: "This is the stronger option", "Most salons get this wrong", "The truth is".
- Vary paragraph length: some 1 sentence, some 4 sentences. Never uniform.
- No symmetrical lists unless genuinely equal-weight. Real journalism uses flowing prose.
- End without restating everything. Close with a forward-looking sentence or a direct invitation — not a summary.

CONTENT RULES:
- Focus on Brazilian beauty (hair care, skincare, nails, makeup, body, wellness, ingredients)
- Be specific about brands, ingredients, regulations, markets (EU, UK, Brazil)
- B2B angle: always think about what distributors and salon owners need to know
- Include at least one FAQ-style section (H2: "Frequently Asked Questions")
- Internal CTA at the end: mention working with BM Supplier for distribution

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "title": "Article title (max 80 chars)",
  "seo_title": "SEO title with keyword (max 60 chars) | Brazilian Beauty Index",
  "seo_description": "Meta description 120-155 chars with primary keyword",
  "excerpt": "2-sentence compelling excerpt for card display",
  "category": "hair-care|skincare|nails|makeup|body|wellness|distribution|ingredients",
  "tags": ["tag1", "tag2", "tag3"],
  "content": "<h2>Section 1</h2><p>...</p><h2>Section 2</h2><p>...</p>..."
}`;

async function generatePost(topic) {
  console.log(`\n📝 Generating: "${topic}"\n`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Write a full editorial article for Brazilian Beauty Index about: "${topic}"\n\nArticle must be 800–1200 words, well-structured with 4–6 H2 sections and a FAQ section. Remember: anti-AI writing style mandatory.` }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();

  let post;
  try {
    post = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse JSON from response');
    post = JSON.parse(match[0]);
  }

  return {
    slug: slugify(post.title || topic),
    title: post.title,
    seo_title: post.seo_title,
    seo_description: post.seo_description,
    excerpt: post.excerpt,
    category: post.category || detectCategory(topic),
    date: new Date().toISOString().split('T')[0],
    tags: post.tags || [],
    author: 'BBI Editorial',
    content: post.content,
  };
}

async function main() {
  const post = await generatePost(topic);

  const existing = JSON.parse(readFileSync(POSTS_FILE, 'utf8'));

  // Avoid duplicate slugs
  if (existing.find(p => p.slug === post.slug)) {
    post.slug = post.slug + '-' + Date.now().toString(36);
  }

  existing.unshift(post); // New posts go first
  writeFileSync(POSTS_FILE, JSON.stringify(existing, null, 2));

  console.log(`✅ Post added to posts.json`);
  console.log(`   Slug: ${post.slug}`);
  console.log(`   Category: ${post.category}`);
  console.log(`   URL: /blog/${post.slug}\n`);
  console.log(`Next: git add blog/posts.json && git commit -m "content: ${post.title}" && git push`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
