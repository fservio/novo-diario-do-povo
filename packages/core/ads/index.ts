/**
 * Ads Engine - Types & Render
 * GAM + AdSense com placeholders anti-CLS
 */

import type { Env } from '../types'
import { getSetting } from '../db'

export interface AdSlot {
  id: number
  name: string
  template: string
  provider: 'gam' | 'adsense' | 'custom'
  sizes_json: string
  lazy: number
  min_height: number
  is_active: number
  gam_unit_path?: string | null
  gam_targeting_json?: string | null
  adsense_slot_id?: string | null
  adsense_format?: string | null
  custom_code?: string | null
}

export interface PageContext {
  template: string
  category?: string
  tags?: string[]
  author?: string
}

export interface UserContext {
  isSubscriber: boolean
}

/**
 * Render ad slot HTML com placeholder anti-CLS
 */
export function renderAdSlot(params: {
  slot: AdSlot
  page: PageContext
  user: UserContext
}): string {
  const { slot, page, user } = params

  // Parse sizes
  let sizes: number[][] = []
  try {
    sizes = JSON.parse(slot.sizes_json)
  } catch {
    sizes = [[300, 250]]
  }

  const sizesStr = JSON.stringify(sizes)
  const isLazy = slot.lazy === 1 ? '1' : '0'
  const isAdSenseInArticle = slot.provider === 'adsense' && (slot.name.includes('inread') || slot.adsense_format === 'in-article' || slot.adsense_format === 'fluid')
  const adsenseFormat = isAdSenseInArticle ? 'fluid' : (slot.adsense_format || 'auto')
  const adsenseLayout = isAdSenseInArticle ? 'in-article' : ''

  if (slot.provider === 'custom' && slot.custom_code) {
    return `<div class="ad-slot" 
      data-ad-slot="${escapeHtml(slot.name)}" 
      data-provider="custom"
      style="min-height: ${slot.min_height}px; display: block;"
    >
      ${slot.custom_code}
    </div>`
  }

  if (slot.provider === 'adsense' && slot.adsense_slot_id) {
    return `<div class="ad-slot ad-slot--adsense"
      data-ad-slot="${escapeHtml(slot.name)}"
      data-provider="adsense"
      data-sizes='${sizesStr}'
      data-lazy="${isLazy}"
      data-adsense-slot="${escapeHtml(slot.adsense_slot_id)}"
      data-adsense-format="${escapeHtml(adsenseFormat)}"
      ${adsenseLayout ? `data-adsense-layout="${escapeHtml(adsenseLayout)}"` : ''}
      style="min-height: ${slot.min_height}px; display: block; width: 100%; text-align: center;"
    >
      <ins class="adsbygoogle"
        style="display: block; width: 100%; min-height: ${slot.min_height}px;"
        data-ad-client=""
        data-ad-slot="${escapeHtml(slot.adsense_slot_id)}"
        data-ad-format="${escapeHtml(adsenseFormat)}"
        ${adsenseLayout ? `data-ad-layout="${escapeHtml(adsenseLayout)}"` : ''}
        data-full-width-responsive="true"></ins>
    </div>`
  }

  return `<div class="ad-slot" 
    data-ad-slot="${escapeHtml(slot.name)}" 
    data-provider="${slot.provider}" 
    data-sizes='${sizesStr}' 
    data-lazy="${isLazy}"
    ${slot.provider === 'gam' && slot.gam_unit_path ? `data-gam-unit="${escapeHtml(slot.gam_unit_path)}"` : ''}
    ${slot.provider === 'gam' && slot.gam_targeting_json ? `data-gam-targeting='${escapeHtml(slot.gam_targeting_json)}'` : ''}
    ${slot.provider === 'adsense' && slot.adsense_slot_id ? `data-adsense-slot="${escapeHtml(slot.adsense_slot_id)}"` : ''}
    ${slot.provider === 'adsense' && slot.adsense_format ? `data-adsense-format="${escapeHtml(slot.adsense_format)}"` : ''}
    style="min-height: ${slot.min_height}px; display: block;"
  >
    <div class="ad-placeholder" style="display: flex; align-items: center; justify-content: center; height: ${slot.min_height}px; background: #f3f4f6; color: #9ca3af; font-size: 12px;">
      Anúncio
    </div>
  </div>`
}

/**
 * Find active slots by template
 */
export async function findActiveSlotsByTemplate(env: Env, template: string): Promise<AdSlot[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM ads_slots WHERE template = ? AND is_active = 1 ORDER BY id'
  ).bind(template).all<AdSlot>()

  return result.results || []
}

/**
 * Filter slots based on subscriber mode settings
 */
export async function filterSlotsBySubscriberMode(
  env: Env,
  slots: AdSlot[],
  isSubscriber: boolean,
  template: string
): Promise<AdSlot[]> {
  const subscriberModeEnabled = await getSetting(env, 'ads.subscriber_mode.enabled', 'public')

  if (!subscriberModeEnabled || !isSubscriber) {
    return slots
  }

  // For subscribers, apply restrictions
  if (template === 'article') {
    const disableSticky = await getSetting(env, 'ads.subscriber_mode.article_disable_sticky', 'public')
    const maxInread = await getSetting(env, 'ads.subscriber_mode.article_max_inread', 'public') || 99

    let filtered = slots.filter(slot => {
      // Remove sticky mobile for subscribers
      if (disableSticky && slot.name.includes('sticky')) {
        return false
      }
      return true
    })

    // Limit inread ads
    const inreadSlots = filtered.filter(s => s.name.includes('inread'))
    if (inreadSlots.length > maxInread) {
      // Keep only first N inread
      const inreadNames = inreadSlots.slice(0, maxInread).map(s => s.name)
      filtered = filtered.filter(s => !s.name.includes('inread') || inreadNames.includes(s.name))
    }

    return filtered
  }

  return slots
}

/**
 * Generate client loader script
 */
export async function generateAdsLoaderScript(env: Env, nonce: string): Promise<string> {
  const [providerModeRaw, consentEnabledRaw, adsenseClientIdRaw, gamNetworkCodeRaw] = await Promise.all([
    getSetting(env, 'ads.provider_mode', 'public'),
    getSetting(env, 'ads.consent.enabled', 'public'),
    getSetting(env, 'ads.adsense.client_id', 'public'),
    getSetting(env, 'ads.gam.network_code', 'public'),
  ])
  const providerMode = providerModeRaw || 'off'
  const consentEnabled = consentEnabledRaw || false
  const adsenseClientId = adsenseClientIdRaw || ''
  const gamNetworkCode = gamNetworkCodeRaw || ''

  if (providerMode === 'off') {
    return '<!-- Ads disabled -->'
  }

  return `<script nonce="${nonce}">
(function() {
  'use strict';
  
  const providerMode = '${providerMode}';
  const consentEnabled = ${consentEnabled};
  const adsenseClientId = '${adsenseClientId}';
  const gamNetworkCode = '${gamNetworkCode}';
  
  let scriptsLoaded = {
    adsense: false,
    gam: false
  };
  let adsenseReady = false;
  let adsenseCallbacks = [];
  let adsStarted = false;
  const isMobileViewport = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;

  function loadAdSenseScript(callback) {
    if (!adsenseClientId) return;
    if (adsenseReady || window.adsbygoogle?.loaded) {
      callback();
      return;
    }
    adsenseCallbacks.push(callback);
    if (scriptsLoaded.adsense) return;
    
    const script = document.createElement('script');
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + adsenseClientId;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = function() {
      adsenseReady = true;
      const callbacks = adsenseCallbacks.splice(0);
      callbacks.forEach(function(fn) { fn(); });
    };
    script.onerror = function() {
      adsenseCallbacks = [];
    };
    document.head.appendChild(script);
    scriptsLoaded.adsense = true;
  }

  function loadGAMScript() {
    if (scriptsLoaded.gam || !gamNetworkCode) return;
    
    const script = document.createElement('script');
    script.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
    script.async = true;
    document.head.appendChild(script);
    scriptsLoaded.gam = true;
    window.googletag = window.googletag || {cmd: []};
  }

  function initAdSlot(el) {
    const provider = el.dataset.provider;
    const name = el.dataset.adSlot;
    if (el.dataset.adInitialized === '1') return;
    el.dataset.adInitialized = '1';

    if (provider === 'adsense' && (providerMode === 'adsense' || providerMode === 'both')) {
      window.adsbygoogle = window.adsbygoogle || [];
      let ins = el.querySelector('ins.adsbygoogle');
      if (!ins) {
        ins = document.createElement('ins');
        el.appendChild(ins);
      }
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.style.width = '100%';
      if (el.style.minHeight && !ins.style.minHeight) {
        ins.style.minHeight = el.style.minHeight;
      }
      ins.dataset.adClient = adsenseClientId;
      ins.dataset.adSlot = el.dataset.adsenseSlot || '';
      const adsenseFormat = el.dataset.adsenseFormat || 'auto';
      const isInArticle = adsenseFormat === 'in-article' || el.dataset.adsenseLayout === 'in-article' || name.indexOf('inread') !== -1;
      ins.dataset.adFormat = isInArticle ? 'fluid' : adsenseFormat;
      if (isInArticle) {
        ins.dataset.adLayout = 'in-article';
      }
      ins.dataset.fullWidthResponsive = 'true';
      loadAdSenseScript(function() {
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      });
    } else if (provider === 'gam' && (providerMode === 'gam' || providerMode === 'both')) {
      loadGAMScript();
      googletag.cmd.push(function() {
        const sizes = JSON.parse(el.dataset.sizes || '[[300,250]]');
        const unitPath = el.dataset.gamUnit || '';
        const slot = googletag.defineSlot('/' + gamNetworkCode + unitPath, sizes, name);
        if (slot) {
          slot.addService(googletag.pubads());
          googletag.display(name);
        }
      });
    }
  }

  function startAds() {
    if (adsStarted) return;
    adsStarted = true;
    document.querySelectorAll('.ad-slot').forEach(initAdSlot);
  }

  function scheduleStartAds() {
    if (!isMobileViewport) {
      startAds();
      return;
    }

    const startAfterLoad = function() {
      setTimeout(startAds, 2500);
    };

    ['scroll', 'touchstart', 'pointerdown', 'keydown'].forEach(function(eventName) {
      window.addEventListener(eventName, startAds, { once: true, passive: true });
    });

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(startAds, { timeout: 4000 });
    }

    if (document.readyState === 'complete') {
      startAfterLoad();
    } else {
      window.addEventListener('load', startAfterLoad, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleStartAds);
  } else {
    scheduleStartAds();
  }
})();
</script>`
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m] || m)
}

