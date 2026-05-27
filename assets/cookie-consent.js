/* ============================================================================
 * Brazilian Beauty Index — Cookie Consent
 * GDPR / UK PECR compliant. Granular categories, opt-in by default, persisted
 * in localStorage for 12 months. Re-openable via window.BBIConsent.open().
 *
 * Categories:
 *   - necessary  (always on, cannot be disabled)
 *   - analytics  (Google Analytics, Plausible, etc. — off by default)
 *   - marketing  (Meta Pixel, retargeting — off by default, reserved)
 *
 * Public API:
 *   window.BBIConsent.has('analytics') -> boolean
 *   window.BBIConsent.open()           -> opens customise modal
 *   window.BBIConsent.reset()          -> clears choice, banner returns
 *   window.BBIConsent.get()            -> raw choice object or null
 *
 * Events on window:
 *   'bbi:consent:change'  detail = { necessary, analytics, marketing }
 *
 * dataLayer events (for GTM):
 *   { event: 'cookie_consent_shown' }
 *   { event: 'cookie_consent_choice', choice: 'accept_all'|'reject_all'|'custom',
 *     analytics: bool, marketing: bool }
 * ========================================================================== */

(function () {
  'use strict';

  var STORAGE_KEY = 'bbi_cookie_consent';
  var EXPIRY_DAYS = 365; // 12 months
  var VERSION     = 1;

  /* ---------------------------------------------------------------------- */
  /*  Storage helpers                                                       */
  /* ---------------------------------------------------------------------- */

  function readChoice() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.version !== VERSION) return null;
      if (!parsed.expiresAt || Date.now() > parsed.expiresAt) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function writeChoice(choice, source) {
    var payload = {
      version:    VERSION,
      necessary:  true,
      analytics:  !!choice.analytics,
      marketing:  !!choice.marketing,
      source:     source || 'custom',
      savedAt:    Date.now(),
      expiresAt:  Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) { /* ignore quota */ }
    window.dispatchEvent(new CustomEvent('bbi:consent:change', { detail: payload }));
    if (window.dataLayer) {
      window.dataLayer.push({
        event:     'cookie_consent_choice',
        choice:    source || 'custom',
        analytics: payload.analytics,
        marketing: payload.marketing
      });
    }
    return payload;
  }

  /* ---------------------------------------------------------------------- */
  /*  CSS injection                                                          */
  /* ---------------------------------------------------------------------- */

  function injectStyles() {
    if (document.getElementById('bbi-consent-styles')) return;
    var css = ''
      + '.bbi-consent-banner,.bbi-consent-modal-overlay{font-family:"DM Sans",system-ui,sans-serif;color:#0D3224;box-sizing:border-box}'
      + '.bbi-consent-banner *,.bbi-consent-modal-overlay *{box-sizing:border-box}'
      + '.bbi-consent-banner{position:fixed;left:0;right:0;bottom:0;z-index:9998;background:#F8F6F2;border-top:1px solid rgba(13,50,36,.12);box-shadow:0 -8px 32px rgba(13,50,36,.08);padding:20px 24px;animation:bbiConsentSlideUp .32s cubic-bezier(.2,.7,.2,1)}'
      + '@keyframes bbiConsentSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}'
      + '.bbi-consent-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:24px;flex-wrap:wrap}'
      + '.bbi-consent-text{flex:1 1 320px;min-width:0}'
      + '.bbi-consent-title{font-family:"Cormorant Garamond",Georgia,serif;font-size:22px;font-weight:500;line-height:1.2;margin:0 0 6px;color:#0D3224}'
      + '.bbi-consent-body{font-size:13px;line-height:1.55;color:rgba(17,17,17,.72);margin:0}'
      + '.bbi-consent-body a{color:#0D3224;text-decoration:underline;text-underline-offset:2px}'
      + '.bbi-consent-actions{display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0}'
      + '.bbi-consent-btn{font-family:inherit;font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:500;padding:11px 18px;border-radius:2px;border:1px solid transparent;cursor:pointer;transition:background .18s,color .18s,border-color .18s;white-space:nowrap}'
      + '.bbi-consent-btn:focus-visible{outline:2px solid #C9962A;outline-offset:2px}'
      + '.bbi-consent-btn-primary{background:#0D3224;color:#fff;border-color:#0D3224}'
      + '.bbi-consent-btn-primary:hover{background:#174D38;border-color:#174D38}'
      + '.bbi-consent-btn-secondary{background:transparent;color:#0D3224;border-color:rgba(13,50,36,.35)}'
      + '.bbi-consent-btn-secondary:hover{background:rgba(13,50,36,.06);border-color:#0D3224}'
      + '.bbi-consent-btn-ghost{background:transparent;color:#0D3224;border-color:transparent;text-decoration:underline;text-underline-offset:3px;padding:11px 8px}'
      + '.bbi-consent-btn-ghost:hover{color:#C9962A}'
      + '@media (max-width:640px){.bbi-consent-banner{padding:16px}.bbi-consent-inner{gap:14px}.bbi-consent-title{font-size:19px}.bbi-consent-body{font-size:12.5px}.bbi-consent-actions{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px}.bbi-consent-btn{padding:12px 10px;font-size:11px;width:100%}.bbi-consent-btn-ghost{grid-column:1/-1;padding:8px}}'
      /* modal */
      + '.bbi-consent-modal-overlay{position:fixed;inset:0;z-index:9999;background:rgba(13,50,36,.66);display:flex;align-items:center;justify-content:center;padding:20px;animation:bbiConsentFade .2s ease}'
      + '@keyframes bbiConsentFade{from{opacity:0}to{opacity:1}}'
      + '.bbi-consent-modal{background:#F8F6F2;width:100%;max-width:540px;max-height:88vh;overflow-y:auto;border-radius:3px;padding:32px;box-shadow:0 24px 80px rgba(13,50,36,.32);position:relative;animation:bbiConsentPop .26s cubic-bezier(.2,.7,.2,1)}'
      + '@keyframes bbiConsentPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}'
      + '.bbi-consent-modal-close{position:absolute;top:14px;right:14px;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;color:rgba(17,17,17,.55);padding:6px 10px;border-radius:2px}'
      + '.bbi-consent-modal-close:hover{color:#0D3224;background:rgba(13,50,36,.06)}'
      + '.bbi-consent-modal-close:focus-visible{outline:2px solid #C9962A;outline-offset:2px}'
      + '.bbi-consent-modal-eyebrow{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#C9962A;font-weight:500;margin:0 0 8px}'
      + '.bbi-consent-modal-title{font-family:"Cormorant Garamond",Georgia,serif;font-size:28px;line-height:1.15;font-weight:500;color:#0D3224;margin:0 0 10px}'
      + '.bbi-consent-modal-lede{font-size:13.5px;line-height:1.6;color:rgba(17,17,17,.72);margin:0 0 22px}'
      + '.bbi-consent-modal-lede a{color:#0D3224;text-decoration:underline;text-underline-offset:2px}'
      + '.bbi-consent-cat{border:1px solid rgba(13,50,36,.12);border-radius:3px;padding:16px;margin-bottom:10px;background:#fff}'
      + '.bbi-consent-cat-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}'
      + '.bbi-consent-cat-title{font-family:"Cormorant Garamond",Georgia,serif;font-size:18px;font-weight:500;color:#0D3224;margin:0 0 4px}'
      + '.bbi-consent-cat-desc{font-size:12.5px;line-height:1.55;color:rgba(17,17,17,.65);margin:0}'
      + '.bbi-consent-cat-locked{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:rgba(13,50,36,.55);font-weight:500;padding:6px 10px;border:1px solid rgba(13,50,36,.18);border-radius:20px;flex-shrink:0;white-space:nowrap}'
      /* switch */
      + '.bbi-consent-switch{position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;margin-top:2px}'
      + '.bbi-consent-switch input{opacity:0;width:0;height:0}'
      + '.bbi-consent-switch-track{position:absolute;cursor:pointer;inset:0;background:rgba(13,50,36,.22);border-radius:24px;transition:background .2s}'
      + '.bbi-consent-switch-track:before{position:absolute;content:"";height:18px;width:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .22s cubic-bezier(.2,.7,.2,1);box-shadow:0 1px 3px rgba(0,0,0,.18)}'
      + '.bbi-consent-switch input:checked + .bbi-consent-switch-track{background:#0D3224}'
      + '.bbi-consent-switch input:checked + .bbi-consent-switch-track:before{transform:translateX(18px)}'
      + '.bbi-consent-switch input:focus-visible + .bbi-consent-switch-track{outline:2px solid #C9962A;outline-offset:2px}'
      + '.bbi-consent-modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:22px;flex-wrap:wrap}'
      + '@media (max-width:520px){.bbi-consent-modal{padding:24px 20px;max-height:92vh}.bbi-consent-modal-title{font-size:24px}.bbi-consent-modal-actions{flex-direction:column-reverse}.bbi-consent-modal-actions .bbi-consent-btn{width:100%}}';
    var style = document.createElement('style');
    style.id = 'bbi-consent-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------------------- */
  /*  Banner                                                                */
  /* ---------------------------------------------------------------------- */

  function buildBanner() {
    var banner = document.createElement('aside');
    banner.className = 'bbi-consent-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.setAttribute('aria-live', 'polite');
    banner.id = 'bbi-consent-banner';
    banner.innerHTML = ''
      + '<div class="bbi-consent-inner">'
      +   '<div class="bbi-consent-text">'
      +     '<h2 class="bbi-consent-title">A note on cookies</h2>'
      +     '<p class="bbi-consent-body">We use cookies that are strictly necessary to run this site. With your permission, we would also like to use analytics cookies to understand how readers use the Index. Read our <a href="/privacy/">Privacy Policy</a> and <a href="/cookies/">Cookie Policy</a>.</p>'
      +   '</div>'
      +   '<div class="bbi-consent-actions">'
      +     '<button type="button" class="bbi-consent-btn bbi-consent-btn-ghost" data-bbi-consent-action="customise" aria-label="Customise cookie preferences">Customise</button>'
      +     '<button type="button" class="bbi-consent-btn bbi-consent-btn-secondary" data-bbi-consent-action="reject" aria-label="Reject non-essential cookies">Reject non-essential</button>'
      +     '<button type="button" class="bbi-consent-btn bbi-consent-btn-primary" data-bbi-consent-action="accept" aria-label="Accept all cookies">Accept all</button>'
      +   '</div>'
      + '</div>';
    return banner;
  }

  function showBanner() {
    if (document.getElementById('bbi-consent-banner')) return;
    var banner = buildBanner();
    document.body.appendChild(banner);

    banner.addEventListener('click', function (e) {
      var action = e.target && e.target.getAttribute('data-bbi-consent-action');
      if (!action) return;
      if (action === 'accept') {
        writeChoice({ analytics: true, marketing: true }, 'accept_all');
        removeBanner();
      } else if (action === 'reject') {
        writeChoice({ analytics: false, marketing: false }, 'reject_all');
        removeBanner();
      } else if (action === 'customise') {
        openModal();
      }
    });

    if (window.dataLayer) window.dataLayer.push({ event: 'cookie_consent_shown' });
  }

  function removeBanner() {
    var b = document.getElementById('bbi-consent-banner');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  /* ---------------------------------------------------------------------- */
  /*  Modal                                                                 */
  /* ---------------------------------------------------------------------- */

  var lastFocusedBeforeModal = null;

  function buildModal(current) {
    var overlay = document.createElement('div');
    overlay.className = 'bbi-consent-modal-overlay';
    overlay.id = 'bbi-consent-modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'bbi-consent-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bbi-consent-modal-title');
    modal.setAttribute('aria-describedby', 'bbi-consent-modal-lede');
    modal.tabIndex = -1;

    var analyticsChecked = current && current.analytics ? 'checked' : '';
    var marketingChecked = current && current.marketing ? 'checked' : '';

    modal.innerHTML = ''
      + '<button type="button" class="bbi-consent-modal-close" data-bbi-consent-action="close" aria-label="Close cookie preferences">&times;</button>'
      + '<p class="bbi-consent-modal-eyebrow">Cookie preferences</p>'
      + '<h2 class="bbi-consent-modal-title" id="bbi-consent-modal-title">Choose what we may store</h2>'
      + '<p class="bbi-consent-modal-lede" id="bbi-consent-modal-lede">You can change these any time via the footer. Full detail in our <a href="/privacy/">Privacy Policy</a> and <a href="/cookies/">Cookie Policy</a>.</p>'

      + '<div class="bbi-consent-cat">'
      +   '<div class="bbi-consent-cat-head">'
      +     '<div>'
      +       '<h3 class="bbi-consent-cat-title">Strictly necessary</h3>'
      +       '<p class="bbi-consent-cat-desc">Required for the site to function — page navigation, security, remembering your cookie choice. Cannot be disabled.</p>'
      +     '</div>'
      +     '<span class="bbi-consent-cat-locked" aria-label="Always on">Always on</span>'
      +   '</div>'
      + '</div>'

      + '<div class="bbi-consent-cat">'
      +   '<div class="bbi-consent-cat-head">'
      +     '<div>'
      +       '<h3 class="bbi-consent-cat-title">Analytics</h3>'
      +       '<p class="bbi-consent-cat-desc">Aggregated, anonymous data — pages visited, time on page — to help us improve the editorial. Google Analytics.</p>'
      +     '</div>'
      +     '<label class="bbi-consent-switch">'
      +       '<input type="checkbox" id="bbi-consent-analytics" ' + analyticsChecked + ' aria-label="Enable analytics cookies">'
      +       '<span class="bbi-consent-switch-track"></span>'
      +     '</label>'
      +   '</div>'
      + '</div>'

      + '<div class="bbi-consent-cat">'
      +   '<div class="bbi-consent-cat-head">'
      +     '<div>'
      +       '<h3 class="bbi-consent-cat-title">Marketing</h3>'
      +       '<p class="bbi-consent-cat-desc">Used to measure ad campaigns and show relevant content on other platforms. Currently reserved — no active marketing tags.</p>'
      +     '</div>'
      +     '<label class="bbi-consent-switch">'
      +       '<input type="checkbox" id="bbi-consent-marketing" ' + marketingChecked + ' aria-label="Enable marketing cookies">'
      +       '<span class="bbi-consent-switch-track"></span>'
      +     '</label>'
      +   '</div>'
      + '</div>'

      + '<div class="bbi-consent-modal-actions">'
      +   '<button type="button" class="bbi-consent-btn bbi-consent-btn-secondary" data-bbi-consent-action="reject" aria-label="Reject non-essential cookies">Reject non-essential</button>'
      +   '<button type="button" class="bbi-consent-btn bbi-consent-btn-primary" data-bbi-consent-action="save" aria-label="Save my cookie preferences">Save preferences</button>'
      + '</div>';

    overlay.appendChild(modal);
    return overlay;
  }

  function openModal() {
    closeModal(); // ensure single instance
    var current = readChoice();
    var overlay = buildModal(current);
    document.body.appendChild(overlay);
    lastFocusedBeforeModal = document.activeElement;
    document.body.style.overflow = 'hidden';

    var modal = overlay.querySelector('.bbi-consent-modal');

    // Initial focus on close button
    var closeBtn = overlay.querySelector('[data-bbi-consent-action="close"]');
    if (closeBtn) closeBtn.focus();

    // Action handlers
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { closeModal(); return; }
      var action = e.target && e.target.getAttribute && e.target.getAttribute('data-bbi-consent-action');
      if (!action) return;
      if (action === 'close') { closeModal(); return; }
      if (action === 'reject') {
        writeChoice({ analytics: false, marketing: false }, 'reject_all');
        closeModal();
        removeBanner();
        return;
      }
      if (action === 'save') {
        var a = overlay.querySelector('#bbi-consent-analytics');
        var m = overlay.querySelector('#bbi-consent-marketing');
        writeChoice({
          analytics: !!(a && a.checked),
          marketing: !!(m && m.checked)
        }, 'custom');
        closeModal();
        removeBanner();
        return;
      }
    });

    // Keyboard: Esc + focus trap
    function onKeydown(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.key === 'Tab' || e.keyCode === 9) {
        var focusables = modal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        var first = focusables[0];
        var last  = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }
    overlay._bbiKeyHandler = onKeydown;
    document.addEventListener('keydown', onKeydown);
  }

  function closeModal() {
    var overlay = document.getElementById('bbi-consent-modal-overlay');
    if (!overlay) return;
    if (overlay._bbiKeyHandler) {
      document.removeEventListener('keydown', overlay._bbiKeyHandler);
    }
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.body.style.overflow = '';
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
      try { lastFocusedBeforeModal.focus(); } catch (e) {}
    }
    lastFocusedBeforeModal = null;
  }

  /* ---------------------------------------------------------------------- */
  /*  Public API                                                            */
  /* ---------------------------------------------------------------------- */

  window.BBIConsent = {
    has: function (category) {
      var choice = readChoice();
      if (!choice) return false;
      if (category === 'necessary') return true;
      return !!choice[category];
    },
    get: function () {
      return readChoice();
    },
    open: function () {
      injectStyles();
      openModal();
    },
    reset: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      closeModal();
      removeBanner();
      showBanner();
    }
  };

  /* ---------------------------------------------------------------------- */
  /*  Boot                                                                  */
  /* ---------------------------------------------------------------------- */

  function init() {
    injectStyles();

    // Wire any footer/inline trigger
    document.querySelectorAll('[data-bbi-consent-trigger]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        window.BBIConsent.open();
      });
    });

    if (!readChoice()) showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
