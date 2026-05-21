#!/usr/bin/env node
/**
 * Brazilian Beauty Index — Newsletter Generator + Sender
 *
 * 1. Reads latest posts from blog/posts.json
 * 2. Claude API generates editorial intro + curated digest
 * 3. Resend sends to all subscribers in Supabase
 *
 * Usage:
 *   node scripts/generate-newsletter.mjs              # Send to all subscribers
 *   node scripts/generate-newsletter.mjs --preview    # Log HTML only, don't send
 *   node scripts/generate-newsletter.mjs --to me@x.com  # Send to one address only
 *
 * Requires: ANTHROPIC_API_KEY, RESEND_API_KEY, SUPABASE_URL, SUPABASE_KEY
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir  = path.dirname(fileURLToPath(import.meta.url));
const POSTS  = path.join(__dir, '../blog/posts.json');

const API_KEY      = process.env.ANTHROPIC_API_KEY;
const RESEND_KEY   = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.BBI_SUPABASE_URL  || process.env.BRAE_PRO_SUPABASE_URL;
const SUPABASE_KEY = process.env.BBI_SUPABASE_KEY  || process.env.BRAE_PRO_SUPABASE_KEY;
const FROM_EMAIL   = process.env.BBI_FROM_EMAIL    || 'digest@brazilianbeautyindex.com';
const SITE_URL     = 'https://www.brazilianbeautyindex.com';

if (!API_KEY)    { console.error('❌  ANTHROPIC_API_KEY not set'); process.exit(1); }
if (!RESEND_KEY) { console.error('❌  RESEND_API_KEY not set'); process.exit(1); }

const args    = process.argv.slice(2);
const preview = args.includes('--preview');
const toEmail = args.includes('--to') ? args[args.indexOf('--to')+1] : null;

// ── Get latest posts ──────────────────────────────────────────────────────────
function getLatestPosts(n = 6) {
  const posts = JSON.parse(readFileSync(POSTS, 'utf8'));
  return posts.slice(0, n);
}

// ── Get week number ───────────────────────────────────────────────────────────
function getWeekNumber() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
}

// ── Generate editorial intro via Claude ───────────────────────────────────────
async function generateIntro(posts) {
  const titles = posts.map(p => `- ${p.title}`).join('\n');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5',
      max_tokens: 400,
      system: `You write short editorial intros for The Brazilian Beauty Digest — a weekly newsletter about Brazilian beauty.
Write like a knowledgeable beauty editor who's passionate but concise.
Anti-AI rules: vary sentence length, use fragments, start some sentences with "But" or "And", no filler words.
Write 3-4 sentences max. Mention one specific thing from the articles listed. End with a forward-looking line.`,
      messages: [{
        role:    'user',
        content: `Write this week's editorial intro for Issue #${getWeekNumber()}.\n\nThis week's articles:\n${titles}\n\nKeep it under 80 words. Make it feel like a real editor wrote it, not an AI.`,
      }],
    }),
  });
  const data = await resp.json();
  return data.content[0].text.trim();
}

// ── Get subscribers from Supabase ─────────────────────────────────────────────
async function getSubscribers() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('⚠️  Supabase not configured — using test email only');
    return [{ email: FROM_EMAIL, first_name: 'Test' }];
  }
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/bbi_subscribers?select=email,first_name&status=eq.active`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  return resp.ok ? await resp.json() : [];
}

// ── Build HTML email ──────────────────────────────────────────────────────────
function buildEmail(intro, posts, issueNum) {
  const articleRows = posts.slice(0, 5).map(p => `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #F0EDE8">
        <span style="display:block;font-size:9px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#C9962A;margin-bottom:6px">${p.category?.replace('-',' ').toUpperCase() || 'HAIR CARE'}</span>
        <a href="${SITE_URL}/blog/${p.slug}" style="display:block;font-family:Georgia,serif;font-size:18px;font-weight:400;color:#111111;text-decoration:none;line-height:1.35;margin-bottom:6px">${p.title}</a>
        <span style="font-size:13px;color:rgba(17,17,17,.55);line-height:1.6">${p.excerpt || ''}</span>
        <a href="${SITE_URL}/blog/${p.slug}" style="display:inline-block;font-size:11px;font-weight:500;color:#0D3224;text-decoration:underline;margin-top:8px">Read →</a>
      </td>
    </tr>`).join('');

  const spotlightPost = posts[0];

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>The Brazilian Beauty Digest — Issue #${issueNum}</title></head>
<body style="margin:0;padding:0;background:#F8F6F2;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F2;padding:32px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">

  <!-- Header -->
  <tr><td style="background:#0D3224;padding:32px 40px;border-radius:4px 4px 0 0">
    <p style="margin:0 0 6px;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.4)">The Brazilian Beauty Digest</p>
    <h1 style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:400;color:#FFFFFF;font-style:italic;line-height:1.2">Issue #${issueNum} &nbsp;·&nbsp; Brazilian Beauty</h1>
  </td></tr>

  <!-- Editorial Intro -->
  <tr><td style="background:#FFFFFF;padding:32px 40px;border-bottom:3px solid #C9962A">
    <p style="margin:0;font-size:15px;line-height:1.8;color:#333333;font-style:italic">${intro}</p>
  </td></tr>

  <!-- Articles -->
  <tr><td style="background:#FFFFFF;padding:8px 40px 32px">
    <p style="font-size:9px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:rgba(17,17,17,.35);margin:24px 0 8px">THIS WEEK'S READS</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${articleRows}
    </table>
  </td></tr>

  <!-- Brand Spotlight placeholder -->
  <tr><td style="background:#F9F7F4;padding:28px 40px;border:1px solid #E8E3DA;margin:0 0 2px">
    <p style="margin:0 0 4px;font-size:9px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#C9962A">BRAND SPOTLIGHT</p>
    <p style="margin:0;font-family:Georgia,serif;font-size:17px;color:#111;font-weight:400">Featured partnership coming soon.</p>
    <p style="margin:8px 0 0;font-size:12px;color:rgba(17,17,17,.45)">Want your brand featured here? <a href="${SITE_URL}/partners/" style="color:#0D3224">Apply for a partnership →</a></p>
  </td></tr>

  <!-- CTA -->
  <tr><td style="background:#FFFFFF;padding:32px 40px;text-align:center">
    <a href="${SITE_URL}/blog/" style="display:inline-block;background:#0D3224;color:#FFFFFF;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:14px 32px;border-radius:2px">Read All Articles →</a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#F8F6F2;padding:24px 40px;border-radius:0 0 4px 4px;text-align:center">
    <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:14px;font-weight:400;color:#0D3224;font-style:italic">Brazilian<span style="color:#C9962A">Beauty</span>Index</p>
    <p style="margin:0;font-size:11px;color:rgba(17,17,17,.35)">© 2026 Brazilian Beauty Index · <a href="${SITE_URL}" style="color:rgba(17,17,17,.35)">brazilianbeautyindex.com</a></p>
    <p style="margin:8px 0 0;font-size:10px;color:rgba(17,17,17,.3)"><a href="{{unsubscribe_url}}" style="color:rgba(17,17,17,.3)">Unsubscribe</a></p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ── Send via Resend ───────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${JSON.stringify(data)}`);
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📧  Brazilian Beauty Digest — Generator\n');

  const posts   = getLatestPosts(6);
  const issueNum = getWeekNumber();

  console.log(`📝  Generating editorial intro for Issue #${issueNum}...`);
  const intro = await generateIntro(posts);
  console.log(`   ✅  Intro: "${intro.slice(0,60)}..."\n`);

  const html    = buildEmail(intro, posts, issueNum);
  const subject = `Issue #${issueNum}: ${posts[0]?.title?.slice(0,50) || 'This Week in Brazilian Beauty'}`;

  if (preview) {
    console.log('PREVIEW MODE — HTML output:\n');
    console.log(subject);
    console.log(html.slice(0, 500) + '...');
    return;
  }

  if (toEmail) {
    console.log(`Sending to: ${toEmail}`);
    await sendEmail(toEmail, subject, html);
    console.log(`✅  Sent to ${toEmail}`);
    return;
  }

  const subscribers = await getSubscribers();
  console.log(`📬  Sending to ${subscribers.length} subscribers...`);

  let sent = 0, failed = 0;
  for (const sub of subscribers) {
    try {
      await sendEmail(sub.email, subject, html);
      sent++;
      await new Promise(r => setTimeout(r, 100)); // rate limit
    } catch (err) {
      console.error(`   ❌  ${sub.email}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✅  Sent: ${sent} · Failed: ${failed}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
