// BBI — Newsletter Subscribe
// POST /api/subscribe  { email, first_name? }
export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.BBI_SUPABASE_URL || process.env.BRAE_PRO_SUPABASE_URL;
const SUPABASE_KEY = process.env.BBI_SUPABASE_KEY || process.env.BRAE_PRO_SUPABASE_KEY;
const RESEND_KEY   = process.env.RESEND_API_KEY;
const FROM_EMAIL   = process.env.BBI_FROM_EMAIL || 'digest@brazilianbeautyindex.com';

const cors = { 'Access-Control-Allow-Origin':'*','Content-Type':'application/json' };

function json(data, status=200){ return new Response(JSON.stringify(data),{status,headers:cors}); }

export default async function handler(req) {
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if (req.method!=='POST') return json({error:'Method not allowed'},405);

  let body;
  try { body = await req.json(); } catch { return json({error:'Invalid JSON'},400); }

  const email = (body.email||'').trim().toLowerCase();
  const name  = (body.first_name||body.name||'').trim().slice(0,80);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({error:'Please enter a valid email address.'},400);

  // Save to Supabase
  if (SUPABASE_URL && SUPABASE_KEY) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/bbi_subscribers`, {
      method:'POST',
      headers:{
        apikey: SUPABASE_KEY,
        Authorization:`Bearer ${SUPABASE_KEY}`,
        'Content-Type':'application/json',
        Prefer:'resolution=ignore-duplicates',
      },
      body: JSON.stringify({ email, first_name: name||null, status:'active', source:'website' }),
    });
    if (!r.ok) {
      const err = await r.text();
      if (!err.includes('duplicate')) console.error('[bbi/subscribe] Supabase:', err);
    }
  }

  // Welcome email
  if (RESEND_KEY) {
    const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;background:#F8F6F2;padding:40px 20px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden">
  <div style="background:#0D3224;padding:28px 36px">
    <p style="margin:0;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.4)">Welcome to</p>
    <h1 style="margin:8px 0 0;font-size:24px;font-weight:400;color:#fff;font-style:italic">The Brazilian Beauty Digest</h1>
  </div>
  <div style="padding:32px 36px">
    <p style="font-size:15px;line-height:1.8;color:#333">Hey${name?' '+name:''},</p>
    <p style="font-size:15px;line-height:1.8;color:#333">You're in. Every week, the best Brazilian beauty content lands in your inbox — brand guides, product reviews, tutorial breakdowns and industry news. No fluff.</p>
    <p style="font-size:15px;line-height:1.8;color:#333">In the meantime, start with our most-read articles:</p>
    <a href="https://www.brazilianbeautyindex.com/blog/" style="display:inline-block;background:#0D3224;color:#fff;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:14px 28px;border-radius:2px;margin-top:8px">Browse the Index →</a>
  </div>
  <div style="padding:20px 36px;background:#F8F6F2;text-align:center">
    <p style="margin:0;font-size:10px;color:rgba(17,17,17,.35)">© 2026 Brazilian Beauty Index · brazilianbeautyindex.com</p>
  </div>
</div></body></html>`;

    await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:`Bearer ${RESEND_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: 'Welcome to The Brazilian Beauty Digest 🌿',
        html,
        reply_to: 'hello@brazilianbeautyindex.com',
      }),
    }).catch(e => console.error('[bbi/subscribe] welcome email:', e.message));
  }

  return json({ ok:true });
}
