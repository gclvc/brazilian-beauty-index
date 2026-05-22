/* BBI Ad Renderer — house ads + future paid slots
 * Usage: drop a <div data-bbi-ad="leaderboard|rectangle|native"></div> anywhere.
 * The renderer reads /ads/ads.json, picks an ad weighted-random, and injects HTML.
 * Logs ad impressions to dataLayer for GTM.
 */
(function () {
  'use strict';

  var ADS_URL = '/ads/ads.json';
  var cache   = null;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function loadAds() {
    if (cache) return Promise.resolve(cache);
    return fetch(ADS_URL).then(function (r) { return r.json(); }).then(function (data) {
      cache = data;
      return data;
    });
  }

  // Weighted-random pick from advertisers that have a creative for the requested slot
  function pick(advertisers, slot) {
    var eligible = advertisers.filter(function (a) { return a.creatives && a.creatives[slot]; });
    if (eligible.length === 0) return null;

    var totalWeight = eligible.reduce(function (s, a) { return s + (a.weight || 1); }, 0);
    var r = Math.random() * totalWeight;
    var acc = 0;
    for (var i = 0; i < eligible.length; i++) {
      acc += (eligible[i].weight || 1);
      if (r < acc) return eligible[i];
    }
    return eligible[eligible.length - 1];
  }

  function track(event, advertiser, slot) {
    if (!window.dataLayer) window.dataLayer = [];
    window.dataLayer.push({
      event: event,
      ad_id:    advertiser.id,
      ad_name:  advertiser.name,
      ad_slot:  slot,
      ad_type:  advertiser.type
    });
  }

  function renderLeaderboard(advertiser) {
    var c = advertiser.creatives.leaderboard;
    var html = ''
      + '<div class="bbi-ad bbi-ad-leaderboard" data-ad-id="' + advertiser.id + '" '
      + '     style="background:' + c.bg + ';color:' + c.text + ';">'
      + '  <div class="bbi-ad-lb-inner">'
      + '    <div class="bbi-ad-lb-text">'
      + '      <div class="bbi-ad-headline">' + c.headline + '</div>'
      + '      <div class="bbi-ad-sub" style="color:' + (c.accent || c.text) + ';opacity:.85;">' + c.sub + '</div>'
      + '    </div>'
      + '    <a class="bbi-ad-cta" href="' + c.url + '" target="_blank" rel="noopener sponsored" '
      + '       style="border:1px solid ' + (c.accent || c.text) + ';color:' + (c.accent || c.text) + ';">'
      + '      ' + c.cta + ' &rarr;'
      + '    </a>'
      + '  </div>'
      + '  <span class="bbi-ad-tag">' + (advertiser.type === 'house' ? 'House ad' : 'Sponsored') + '</span>'
      + '</div>';
    return html;
  }

  function renderRectangle(advertiser) {
    var c = advertiser.creatives.rectangle;
    var html = ''
      + '<a class="bbi-ad bbi-ad-rect" href="' + c.url + '" target="_blank" rel="noopener sponsored" '
      + '   data-ad-id="' + advertiser.id + '" '
      + '   style="background:' + c.bg + ';color:' + c.text + ';">'
      + '  <span class="bbi-ad-tag-rect">' + (advertiser.type === 'house' ? 'House ad' : 'Sponsored') + '</span>'
      + '  <div class="bbi-ad-rect-headline">' + c.headline + '</div>'
      + '  <div class="bbi-ad-rect-sub" style="color:' + (c.accent || c.text) + ';opacity:.85;">' + c.sub + '</div>'
      + '  <span class="bbi-ad-rect-cta" style="color:' + (c.accent || c.text) + ';">' + c.cta + '</span>'
      + '</a>';
    return html;
  }

  function renderNative(advertiser) {
    var c = advertiser.creatives.native;
    var html = ''
      + '<a class="bbi-ad bbi-ad-native" href="' + c.url + '" target="_blank" rel="noopener sponsored" '
      + '   data-ad-id="' + advertiser.id + '">'
      + (c.image ? '  <div class="bbi-ad-native-img"><img src="' + c.image + '" alt="' + c.headline + '" loading="lazy"></div>' : '')
      + '  <div class="bbi-ad-native-body">'
      + '    <span class="bbi-ad-native-label">' + (c.label || 'Sponsored') + '</span>'
      + '    <h3 class="bbi-ad-native-headline">' + c.headline + '</h3>'
      + '    <p class="bbi-ad-native-sub">' + c.sub + '</p>'
      + '    <span class="bbi-ad-native-cta">' + c.cta + ' &rarr;</span>'
      + '  </div>'
      + '</a>';
    return html;
  }

  function inject(el, advertiser, slot) {
    var renderer = ({ leaderboard: renderLeaderboard, rectangle: renderRectangle, native: renderNative })[slot];
    if (!renderer) return;
    el.innerHTML = renderer(advertiser);
    track('ad_impression', advertiser, slot);

    // Track clicks
    var inner = el.querySelector('.bbi-ad');
    if (inner) {
      inner.addEventListener('click', function () { track('ad_click', advertiser, slot); }, { passive: true });
    }
  }

  function renderAll() {
    var slots = $$('[data-bbi-ad]');
    if (slots.length === 0) return;
    loadAds().then(function (data) {
      slots.forEach(function (el) {
        var slot = el.getAttribute('data-bbi-ad');
        var ad   = pick(data.advertisers || [], slot);
        if (ad) inject(el, ad, slot);
        else el.style.display = 'none';
      });
    }).catch(function (e) {
      console.warn('[BBI Ads] failed to load:', e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll);
  } else {
    renderAll();
  }
})();
