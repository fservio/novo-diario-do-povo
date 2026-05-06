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

  if (slot.provider === 'custom' && slot.custom_code) {
    return `<div class="ad-slot" 
      data-ad-slot="${escapeHtml(slot.name)}" 
      data-provider="custom"
      style="min-height: ${slot.min_height}px; display: block;"
    >
      ${slot.custom_code}
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

  function checkConsent() {
    if (!consentEnabled) return true;
    return window.__consent === true;
  }

  function loadAdSenseScript() {
    if (scriptsLoaded.adsense || !adsenseClientId) return;
    if (!checkConsent()) return;
    
    const script = document.createElement('script');
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + adsenseClientId;
    script.async = true;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
    scriptsLoaded.adsense = true;
  }

  function loadGAMScript() {
    if (scriptsLoaded.gam || !gamNetworkCode) return;
    if (!checkConsent()) return;
    
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

    // Inline scripts pasted into custom ad code are blocked by CSP, so initialize
    // AdSense <ins> blocks here when custom code contains them.
    if (provider === 'custom') {
      const adsenseBlocks = el.querySelectorAll('ins.adsbygoogle');
      if (adsenseBlocks.length > 0 && (providerMode === 'adsense' || providerMode === 'both')) {
        loadAdSenseScript();
        window.adsbygoogle = window.adsbygoogle || [];
        adsenseBlocks.forEach(function(ins) {
          if (ins.dataset.adsbygoogleStatus === 'done') return;
          try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
          } catch (e) {
            console.error('AdSense custom push error:', e);
          }
        });
      }
      return;
    }

    if (provider === 'adsense' && (providerMode === 'adsense' || providerMode === 'both')) {
      loadAdSenseScript();

      // Initialize shim immediately if not present
      window.adsbygoogle = window.adsbygoogle || [];

      // No need to wait for script load. The push() will act as a queue.
      // We process immediately to ensure the <ins> tag is ready when the script runs.
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.dataset.adClient = adsenseClientId;
      ins.dataset.adSlot = el.dataset.adsenseSlot || '';
      ins.dataset.adFormat = el.dataset.adsenseFormat || 'auto';
      ins.dataset.fullWidthResponsive = 'true'; // Default to true for responsiveness
      
      el.innerHTML = '';
      el.appendChild(ins);
      
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error('AdSense push error:', e);
      }
    } else if (provider === 'gam' && (providerMode === 'gam' || providerMode === 'both')) {
      loadGAMScript();
      setTimeout(() => {
        if (window.googletag) {
          googletag.cmd.push(function() {
            const sizes = JSON.parse(el.dataset.sizes || '[[300,250]]');
            const unitPath = el.dataset.gamUnit || '';
            const targeting = el.dataset.gamTargeting ? JSON.parse(el.dataset.gamTargeting) : {};
            
            const slot = googletag.defineSlot('/' + gamNetworkCode + unitPath, sizes, name);
            if (slot) {
              for (const key in targeting) {
                slot.setTargeting(key, targeting[key]);
              }
              slot.addService(googletag.pubads());
              googletag.display(name);
            }
          });
        }
      }, 100);
    }
  }

  function observeAdSlots() {
    const slots = document.querySelectorAll('.ad-slot');
    
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting && entry.target.dataset.lazy === '1') {
            initAdSlot(entry.target);
            observer.unobserve(entry.target);
          } else if (entry.target.dataset.lazy === '0') {
            initAdSlot(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: '600px' });
      
      slots.forEach(function(slot) {
        observer.observe(slot);
      });
    } else {
      // Fallback: load all immediately
      slots.forEach(initAdSlot);
    }
  }

  function startAds() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observeAdSlots);
    } else {
      observeAdSlots();
    }
  }

  let adsStarted = false;
  function initAdsOnce() {
    if (adsStarted) return;
    adsStarted = true;
    startAds();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('load', () => setTimeout(initAdsOnce, 1000));
  } else {
    setTimeout(initAdsOnce, 1000);
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

