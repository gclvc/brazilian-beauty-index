// BBI — Newsletter Subscribe (2-step with preference capture)
// POST /api/subscribe
//   Step 1: { email, source }
//   Step 2: { email, segment, interests: string[], source }
// Subsequent calls with the same email update existing row.
export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.BBI_SUPABASE_URL || process.env.BRAE_PRO_SUPABASE_URL;
const SUPABASE_KEY = process.env.BBI_SUPABASE_KEY || process.env.BRAE_PRO_SUPABASE_KEY;
const RESEND_KEY   = process.env.RESEND_API_KEY;
const FROM_EMAIL   = process.env.BBI_FROM_EMAIL || 'digest@brazilianbeautyindex.com';

const cors = { 'Access-Control-Allow-Origin':'*','Content-Type':'application/json' };
const json = (data, status=200) => new Response(JSON.stringify(data),{status,headers:cors});

const VALID_SEGMENTS = ['consumer','professional','distributor','media'];
const VALID_INTERESTS = ['hair','skin','makeup','body','nails','trends','ingredients','brands'];

const SEGMENT_COPY = {
  consumer: {
    greeting: 'Glad to have you, fellow beauty obsessive.',
    body: 'We\'ll send you our best guides, honest reviews and Brazilian beauty discoveries — curated for what actually matters to you.',
  },
  professional: {
    greeting: 'Welcome, fellow industry insider.',
    body: 'Expect salon-grade product reviews, professional protocols, technical breakdowns and the kind of intel that doesn\'t make it into consumer media.',
  },
  distributor: {
    greeting: 'Welcome to the trade side of BBI.',
    body: 'We\'ll prioritise brand intelligence, market trends, CPNP/EU compliance updates and the import-side intel that helps you choose what to stock.',
  },
  media: {
    greeting: 'Welcome.',
    body: 'You\'ll get our editorial calendar, brand stories, expert sources and the inside view of Brazilian beauty as it grows in the UK and EU.',
  },
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (req.method !== 'POST') return json({error:'Method not allowed'},405);

  let body;
  try { body = await req.json(); } catch { return json({error:'Invalid JSON'},400); }

  const email     = (body.email||'').trim().toLowerCase();
  const name      = (body.first_name || body.name || '').trim().slice(0,80);
  const segment   = VALID_SEGMENTS.includes(body.segment) ? body.segment : null;
  const interests = Array.isArray(body.interests)
    ? body.interests.filter(i => VALID_INTERESTS.includes(i)).slice(0,8)
    : null;
  const source    = (body.source || 'website').toString().slice(0,40);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({error:'Please enter a valid email address.'},400);

  const isPrefsUpdate = !!(segment || interests);

  // ── Save to Supabase ──
  if (SUPABASE_URL && SUPABASE_KEY) {
    const row = {
      email,
      status: 'active',
      source,
      ...(name      && { first_name: name }),
      ...(segment   && { segment }),
      ...(interests && { interests }),
    };

    if (isPrefsUpdate) {
      // PATCH the existing row (or upsert)
      const r = await fetch(`${SUPABASE_URL}/rest/v1/bbi_subscribers?email=eq.${encodeURIComponent(email)}`, {
        method:'PATCH',
        headers:{
          apikey: SUPABASE_KEY,
          Authorization:`Bearer ${SUPABASE_KEY}`,
          'Content-Type':'application/json',
          Prefer:'return=minimal',
        },
        body: JSON.stringify(row),
      });
      if (!r.ok) {
        // Row may not exist yet — fall through to insert
        const ins = await fetch(`${SUPABASE_URL}/rest/v1/bbi_subscribers`, {
          method:'POST',
          headers:{
            apikey: SUPABASE_KEY,
            Authorization:`Bearer ${SUPABASE_KEY}`,
            'Content-Type':'application/json',
            Prefer:'resolution=ignore-duplicates',
          },
          body: JSON.stringify(row),
        });
        if (!ins.ok) console.error('[bbi/subscribe] supabase insert (prefs):', await ins.text());
      }
    } else {
      // INSERT (initial signup)
      const r = await fetch(`${SUPABASE_URL}/rest/v1/bbi_subscribers`, {
        method:'POST',
        headers:{
          apikey: SUPABASE_KEY,
          Authorization:`Bearer ${SUPABASE_KEY}`,
          'Content-Type':'application/json',
          Prefer:'resolution=ignore-duplicates',
        },
        body: JSON.stringify(row),
      });
      if (!r.ok) {
        const err = await r.text();
        if (!err.includes('duplicate')) console.error('[bbi/subscribe] supabase insert:', err);
      }
    }
  }

  // ── Send welcome email only on initial signup OR on prefs save (segment-personalised) ──
  if (RESEND_KEY) {
    let subject, html;

    if (isPrefsUpdate && segment) {
      const copy = SEGMENT_COPY[segment];
      const interestLabels = (interests || []).map(i => i.charAt(0).toUpperCase() + i.slice(1)).join(', ');
      subject = 'Your Brazilian Beauty Digest is set up';
      html = welcomeTemplate({
        title: copy.greeting,
        intro: copy.body,
        interests: interestLabels,
      });

      await fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{Authorization:`Bearer ${RESEND_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          subject,
          html,
          reply_to: 'hello@brazilianbeautyindex.com',
        }),
      }).catch(e => console.error('[bbi/subscribe] welcome email:', e.message));
    } else if (!isPrefsUpdate) {
      // Initial signup: short confirmation only — segmented welcome lands after prefs
      subject = 'Welcome to The Brazilian Beauty Digest';
      html = quickConfirmTemplate({ name });

      await fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{Authorization:`Bearer ${RESEND_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          subject,
          html,
          reply_to: 'hello@brazilianbeautyindex.com',
        }),
      }).catch(e => console.error('[bbi/subscribe] confirm email:', e.message));
    }
  }

  return json({ ok:true, step: isPrefsUpdate ? 'prefs_saved' : 'email_saved' });
}

// ── Email templates ──────────────────────────────────────────
function quickConfirmTemplate({ name }) {
  return `<!DOCTYPE html><html><body style="margin:0;font-family:Georgia,serif;background:#F8F6F2;padding:40px 20px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden">
  <div style="background:#0D3224;padding:32px 36px">
    <p style="margin:0;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.4)">Welcome to</p>
    <h1 style="margin:10px 0 0;font-size:28px;font-weight:400;color:#fff;font-style:italic;line-height:1.1">The Brazilian Beauty Digest</h1>
  </div>
  <div style="padding:36px">
    <p style="font-size:16px;line-height:1.7;color:#222;margin:0 0 16px">Hey${name?' '+name:''},</p>
    <p style="font-size:16px;line-height:1.7;color:#222;margin:0 0 16px">You're in. We're now configuring what we send you — give us 60 seconds back on the site to pick your interests, and we'll curate accordingly.</p>
    <p style="font-size:16px;line-height:1.7;color:#222;margin:0 0 24px">No spam, ever. One click to unsubscribe.</p>
    <a href="https://www.brazilianbeautyindex.com/#newsletter" style="display:inline-block;background:#C9962A;color:#fff;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;padding:14px 28px;border-radius:2px">Set my preferences →</a>
  </div>
  <div style="padding:20px 36px;background:#F8F6F2;text-align:center;border-top:1px solid rgba(17,17,17,.06)">
    <p style="margin:0;font-size:10px;color:rgba(17,17,17,.4);letter-spacing:.04em">© 2026 Brazilian Beauty Index · <a href="https://brazilianbeautyindex.com" style="color:rgba(17,17,17,.4)">brazilianbeautyindex.com</a></p>
  </div>
</div></body></html>`;
}

function welcomeTemplate({ title, intro, interests }) {
  return `<!DOCTYPE html><html><body style="margin:0;font-family:Georgia,serif;background:#F8F6F2;padding:40px 20px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden">
  <div style="background:#0D3224;padding:32px 36px">
    <p style="margin:0;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.4)">Welcome</p>
    <h1 style="margin:10px 0 0;font-size:28px;font-weight:400;color:#fff;font-style:italic;line-height:1.1">${title}</h1>
  </div>
  <div style="padding:36px">
    <p style="font-size:16px;line-height:1.7;color:#222;margin:0 0 18px">${intro}</p>
    ${interests ? `<p style="font-size:13px;line-height:1.7;color:rgba(17,17,17,.55);margin:0 0 24px;font-style:italic;">You'll see more of: <strong style="color:#0D3224;font-style:normal">${interests}</strong></p>` : ''}
    <p style="font-size:16px;line-height:1.7;color:#222;margin:0 0 24px">Your first curated edition lands in your inbox within 24 hours. In the meantime, here's a place to start.</p>
    <a href="https://www.brazilianbeautyindex.com/blog/" style="display:inline-block;background:#C9962A;color:#fff;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;padding:14px 28px;border-radius:2px">Browse the Index →</a>
  </div>
  <div style="padding:20px 36px;background:#F8F6F2;text-align:center;border-top:1px solid rgba(17,17,17,.06)">
    <p style="margin:0;font-size:10px;color:rgba(17,17,17,.4);letter-spacing:.04em">© 2026 Brazilian Beauty Index · <a href="https://brazilianbeautyindex.com" style="color:rgba(17,17,17,.4)">brazilianbeautyindex.com</a></p>
  </div>
</div></body></html>`;
}
