// BBI — Brand Registration
// POST /api/brand-register
// { brand_name, website, email, category, markets, message? }
export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.BBI_SUPABASE_URL || process.env.BRAE_PRO_SUPABASE_URL;
const SUPABASE_KEY = process.env.BBI_SUPABASE_KEY || process.env.BRAE_PRO_SUPABASE_KEY;
const RESEND_KEY   = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.BBI_NOTIFY_EMAIL || 'guilherme@bmsupplier.co.uk';
const FROM_EMAIL   = process.env.BBI_FROM_EMAIL   || 'partners@brazilianbeautyindex.com';

const cors = { 'Access-Control-Allow-Origin':'*','Content-Type':'application/json' };
function json(d,s=200){ return new Response(JSON.stringify(d),{status:s,headers:cors}); }

export default async function handler(req) {
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if (req.method!=='POST')    return json({error:'Method not allowed'},405);

  let body;
  try { body = await req.json(); } catch { return json({error:'Invalid JSON'},400); }

  const { brand_name, website, email, category, markets, message } = body;
  if (!brand_name||!email||!category)
    return json({error:'brand_name, email and category are required'},400);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({error:'Invalid email address'},400);

  // Save to Supabase
  if (SUPABASE_URL && SUPABASE_KEY) {
    await fetch(`${SUPABASE_URL}/rest/v1/bbi_brand_registrations`,{
      method:'POST',
      headers:{
        apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`,
        'Content-Type':'application/json', Prefer:'return=minimal',
      },
      body:JSON.stringify({ brand_name, website:website||null, email, category, markets:markets||null, message:message||null, status:'new' }),
    }).catch(e => console.error('[bbi/brand-register] Supabase:', e.message));
  }

  // Notify team
  if (RESEND_KEY) {
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
<div style="background:#0D3224;padding:24px 32px;border-radius:8px 8px 0 0">
  <p style="margin:0;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.4)">Brazilian Beauty Index</p>
  <h2 style="margin:8px 0 0;font-size:20px;color:#fff;font-weight:400">New Brand Registration</h2>
</div>
<div style="background:#fff;padding:28px 32px;border-radius:0 0 8px 8px">
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:12px;color:#aaa;width:40%">Brand</td><td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:14px;font-weight:600">${brand_name}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:12px;color:#aaa">Category</td><td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:14px">${category}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:12px;color:#aaa">Website</td><td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:14px"><a href="${website||'#'}">${website||'—'}</a></td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:12px;color:#aaa">Email</td><td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:14px"><a href="mailto:${email}">${email}</a></td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:12px;color:#aaa">Markets</td><td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:14px">${markets||'—'}</td></tr>
    ${message?`<tr><td style="padding:8px 0;font-size:12px;color:#aaa">Message</td><td style="padding:8px 0;font-size:14px">${message}</td></tr>`:''}
  </table>
  <a href="mailto:${email}?subject=Re: Brazilian Beauty Index Partnership — ${brand_name}" style="display:inline-block;background:#0D3224;color:#fff;text-decoration:none;font-size:11px;padding:12px 24px;border-radius:4px;margin-top:16px">Reply to ${brand_name} →</a>
</div></div>`;

    await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:`Bearer ${RESEND_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        from: FROM_EMAIL, to:[NOTIFY_EMAIL],
        subject:`New brand registration — ${brand_name} (${category})`,
        html, reply_to: email,
      }),
    }).catch(e => console.error('[bbi/brand-register] notify:', e.message));
  }

  return json({ ok:true });
}
