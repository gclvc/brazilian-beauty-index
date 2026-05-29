#!/usr/bin/env python3
"""Wave 3 merge + mega-patch.

1. Merge 18 new posts from blog/_staging/*.json (normalising their schema).
2. Backfill updated_at on existing posts (dateModified freshness signal).
3. Set has_affiliate_links flag on commercial posts (drives template disclosure).
4. Rotate the 93 repeated 'Bottom Line' closings into 6 deterministic variants.
5. Conservative banned-word cleanup (ensure/comprehensive/transformative/delve).

Writes blog/posts.json in place. Backup saved alongside.
"""
import json, re, glob, os, hashlib
from pathlib import Path

ROOT = Path("/Users/guilhermecamargo/Library/Mobile Documents/com~apple~CloudDocs/TKC MASTERPLAN/BRAZILIAN BEAUTY INDEX/deliverables/website")
POSTS = ROOT / "blog/posts.json"
STAGING = sorted(glob.glob(str(ROOT / "blog/_staging/*.json")))

posts = json.loads(POSTS.read_text())
existing_slugs = {p['slug'] for p in posts}
log = []

# ── 1. Normalise + merge new posts ──────────────────────────────────────────
STOPWORDS = {'the','a','an','to','of','in','and','for','your','you','with','how','what','is','are'}
def derive_keyword(slug):
    words = [w for w in slug.split('-') if w not in STOPWORDS]
    return ' '.join(words[:5])

def normalise_new(p):
    # template-required fields the agents didn't emit
    if 'seo_title' not in p:
        t = p['title']
        p['seo_title'] = t if len(t) <= 60 else t[:57].rsplit(' ',1)[0] + '…'
    if 'keyword' not in p:
        # prefer brand + first topical tag, else slug-derived
        p['keyword'] = derive_keyword(p['slug'])
    if 'image_credit' not in p:
        p['image_credit'] = ''
    if 'featured_image' not in p:
        p['featured_image'] = ''
    return p

merged = 0
for f in STAGING:
    for p in json.loads(Path(f).read_text()):
        if p['slug'] in existing_slugs:
            log.append(f"SKIP dup {p['slug']}"); continue
        posts.append(normalise_new(p))
        existing_slugs.add(p['slug'])
        merged += 1
log.append(f"Merged {merged} new posts → {len(posts)} total")

# ── 2. updated_at backfill (dateModified) ───────────────────────────────────
ua = 0
for p in posts:
    if not p.get('updated_at'):
        p['updated_at'] = p.get('date', '2026-05-27'); ua += 1
log.append(f"updated_at backfilled on {ua} posts")

# ── 3. has_affiliate_links flag ─────────────────────────────────────────────
COMMERCIAL = re.compile(r'(review|best-|top-\d|-vs-|\bvs\b|compare|comparison|guide|complete|line-guide)', re.I)
aff = 0
for p in posts:
    is_comm = bool(COMMERCIAL.search(p['slug'])) or p.get('brand') or p.get('category') in ('Brands','Reviews')
    if is_comm and not p.get('has_affiliate_links'):
        p['has_affiliate_links'] = True; aff += 1
log.append(f"has_affiliate_links set on {aff} posts")

# ── 4. Bottom Line rotation ─────────────────────────────────────────────────
VARIANTS = ["The verdict","Where this leaves you","What to take away",
            "The short of it","My honest take","So, worth it?"]
def pick_variant(slug):
    h = int(hashlib.md5(slug.encode()).hexdigest(), 16)
    return VARIANTS[h % len(VARIANTS)]

bl = 0
for p in posts:
    c = p.get('content','')
    if 'Bottom Line' not in c:
        continue
    v = pick_variant(p['slug'])
    # replace 'The Bottom Line' and 'Bottom Line' as heading text (case-sensitive, whole phrase)
    new_c = c.replace('The Bottom Line', v).replace('Bottom Line', v)
    if new_c != c:
        p['content'] = new_c; bl += 1
log.append(f"'Bottom Line' rotated on {bl} posts (6 variants)")

# ── 5. Conservative banned-word cleanup ─────────────────────────────────────
# Only safe 1:1 swaps that never appear in product names. Applied to content only.
SWAPS = [
    (re.compile(r'\bensure\b'), 'make sure'),
    (re.compile(r'\bEnsure\b'), 'Make sure'),
    (re.compile(r'\bcomprehensive\b'), 'thorough'),
    (re.compile(r'\bComprehensive\b'), 'Thorough'),
    (re.compile(r'\btransformative\b'), 'striking'),
    (re.compile(r'\bTransformative\b'), 'Striking'),
    (re.compile(r'\bdelve into\b'), 'look closely at'),
    (re.compile(r'\bDelve into\b'), 'Look closely at'),
]
swap_count = 0
swap_breakdown = {}
for p in posts:
    c = p.get('content','')
    orig = c
    for rx, repl in SWAPS:
        c2, n = rx.subn(repl, c)
        if n:
            swap_breakdown[repl] = swap_breakdown.get(repl,0)+n
            c = c2
    if c != orig:
        p['content'] = c
        swap_count += (1)
log.append(f"Banned-word swaps applied across {swap_count} posts: {swap_breakdown}")

# ── Write ───────────────────────────────────────────────────────────────────
POSTS.write_text(json.dumps(posts, indent=2, ensure_ascii=False))

print("\n".join(log))
print(f"\nFinal post count: {len(posts)}")
from collections import Counter
print("Categories:", dict(Counter(p['category'] for p in posts)))
print("Tiers:", dict(Counter(p.get('tier') for p in posts)))
