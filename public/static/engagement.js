(function () {
  'use strict';

  var STORAGE_KEY = 'dp_engagement_v1';
  var SESSION_KEY = 'dp_engagement_session_v1';
  var NEWSLETTER_KEY = 'dp_newsletter_subscribed_v1';
  var HOUR = 60 * 60 * 1000;
  var MONTH = 30 * 24 * HOUR;

  function readStorage(storage, key, fallback) {
    try {
      var value = storage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) { return fallback; }
  }

  function writeStorage(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage indisponível */ }
  }

  function deviceType() {
    return window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop';
  }

  function eventPayload(campaignId, eventType, pageType, device) {
    fetch('/api/engagement/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: campaignId, eventType: eventType, pageType: pageType, device: device }),
      keepalive: true,
      credentials: 'same-origin'
    }).catch(function () {});
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'engagement_' + eventType, { campaign_id: campaignId, campaign_type: eventType });
    }
  }

  function campaignState(id) {
    var all = readStorage(localStorage, STORAGE_KEY, {});
    var state = all[String(id)] || { impressions: [] };
    state.impressions = (state.impressions || []).filter(function (at) { return Date.now() - at < MONTH; });
    return { all: all, state: state };
  }

  function saveCampaignState(id, container) {
    container.all[String(id)] = container.state;
    writeStorage(localStorage, STORAGE_KEY, container.all);
  }

  function isEligible(campaign, session) {
    if (campaign.type === 'newsletter' && readStorage(localStorage, NEWSLETTER_KEY, false)) return false;
    if (session.shown >= 1 || session.shown >= campaign.frequency.maxPerSession) return false;
    if (session.pageviews < campaign.frequency.minPageviews) return false;
    var container = campaignState(campaign.id);
    var state = container.state;
    if (state.converted) return false;
    if (state.dismissedUntil && state.dismissedUntil > Date.now()) return false;
    if (state.clickedUntil && state.clickedUntil > Date.now()) return false;
    if (state.impressions.length >= campaign.frequency.maxImpressions30d) return false;
    return true;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function renderCampaign(campaign, pageType, device, session) {
    if (document.querySelector('[data-dp-engagement]')) return;
    var wrapper = el('div', 'dp-engagement dp-engagement--' + campaign.format + ' dp-engagement--' + campaign.type);
    wrapper.setAttribute('data-dp-engagement', String(campaign.id));
    var backdrop = el('div', 'dp-engagement__backdrop');
    var panel = el('section', 'dp-engagement__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'dp-engagement-title-' + campaign.id);
    if (campaign.format === 'modal') panel.setAttribute('aria-modal', 'true');

    var close = el('button', 'dp-engagement__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar esta mensagem');
    panel.appendChild(close);

    if (campaign.imageUrl) {
      var image = el('img', 'dp-engagement__image');
      image.src = campaign.imageUrl;
      image.alt = campaign.imageAlt || '';
      image.loading = 'lazy';
      var imagePositionX = campaign.imagePositionX == null ? 50 : Number(campaign.imagePositionX);
      var imagePositionY = campaign.imagePositionY == null ? 50 : Number(campaign.imagePositionY);
      image.style.objectPosition = Math.max(0, Math.min(100, imagePositionX)) + '% ' + Math.max(0, Math.min(100, imagePositionY)) + '%';
      panel.appendChild(image);
    }

    var content = el('div', 'dp-engagement__content');
    var brand = el('div', 'dp-engagement__brand');
    var logo = el('img');
    logo.src = '/static/logo-dp.png';
    logo.alt = 'Diário do Povo';
    brand.appendChild(logo);
    if (campaign.type === 'advertising') brand.appendChild(el('span', '', 'Publicidade'));
    content.appendChild(brand);
    content.appendChild(el('p', 'dp-engagement__eyebrow', campaign.eyebrow));
    var title = el('h2', 'dp-engagement__title', campaign.title);
    title.id = 'dp-engagement-title-' + campaign.id;
    content.appendChild(title);
    if (campaign.body) content.appendChild(el('p', 'dp-engagement__body', campaign.body));

    var message = el('p', 'dp-engagement__message');
    message.setAttribute('role', 'status');

    if (campaign.type === 'newsletter') {
      var form = el('form', 'dp-engagement__form');
      var email = el('input', 'dp-engagement__input');
      email.type = 'email'; email.name = 'email'; email.required = true; email.autocomplete = 'email'; email.placeholder = 'Seu melhor e-mail';
      var honeypot = el('input', 'dp-engagement__honeypot');
      honeypot.type = 'text'; honeypot.name = 'company'; honeypot.tabIndex = -1; honeypot.autocomplete = 'off'; honeypot.setAttribute('aria-hidden', 'true');
      var submit = el('button', 'dp-engagement__cta', campaign.ctaLabel || 'Quero receber');
      submit.type = 'submit';
      var consentLabel = el('label', 'dp-engagement__consent');
      var consent = el('input'); consent.type = 'checkbox'; consent.required = true;
      var consentText = el('span');
      consentText.appendChild(document.createTextNode('Quero receber a newsletter e aceito a '));
      var privacy = el('a', '', 'Política de Privacidade'); privacy.href = '/p/privacidade';
      consentText.appendChild(privacy); consentText.appendChild(document.createTextNode('.'));
      consentLabel.appendChild(consent); consentLabel.appendChild(consentText);
      form.appendChild(email); form.appendChild(honeypot); form.appendChild(submit); form.appendChild(consentLabel); form.appendChild(message);
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!consent.checked) return;
        submit.disabled = true; submit.textContent = 'Inscrevendo…'; message.textContent = '';
        fetch('/api/newsletter/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ email: email.value, company: honeypot.value, consent: true, campaignId: campaign.id, pageType: pageType, device: device })
        }).then(function (response) { return response.json().then(function (data) { return { ok: response.ok, data: data }; }); })
          .then(function (result) {
            if (!result.ok || !result.data.success) throw new Error(result.data.error || 'Não foi possível concluir.');
            message.textContent = result.data.message; form.classList.add('is-success'); email.hidden = true; submit.hidden = true; consentLabel.hidden = true;
            writeStorage(localStorage, NEWSLETTER_KEY, true);
            var stored = campaignState(campaign.id); stored.state.converted = true; saveCampaignState(campaign.id, stored);
            window.setTimeout(function () { dismiss(false); }, 3500);
          }).catch(function (error) {
            message.textContent = error.message || 'Não foi possível concluir. Tente novamente.';
            submit.disabled = false; submit.textContent = campaign.ctaLabel || 'Quero receber';
          });
      });
      content.appendChild(form);
    } else {
      var cta = el('a', 'dp-engagement__cta', campaign.ctaLabel || 'Saiba mais');
      cta.href = campaign.ctaUrl || '/';
      if (/^https?:\/\//i.test(cta.href) && new URL(cta.href).origin !== window.location.origin) {
        cta.target = '_blank'; cta.rel = campaign.type === 'advertising' ? 'sponsored noopener' : 'noopener';
      } else if (campaign.type === 'advertising') cta.rel = 'sponsored';
      cta.addEventListener('click', function () {
        var stored = campaignState(campaign.id);
        stored.state.clickedUntil = Date.now() + campaign.frequency.clickCooldownHours * HOUR;
        saveCampaignState(campaign.id, stored);
        eventPayload(campaign.id, 'click', pageType, device);
      });
      content.appendChild(cta);
    }

    if (campaign.type === 'advertising' && campaign.advertiserName) content.appendChild(el('p', 'dp-engagement__advertiser', 'Conteúdo de ' + campaign.advertiserName));
    panel.appendChild(content); wrapper.appendChild(backdrop); wrapper.appendChild(panel); document.body.appendChild(wrapper);

    var previousFocus = document.activeElement;
    var stored = campaignState(campaign.id);
    stored.state.impressions.push(Date.now()); saveCampaignState(campaign.id, stored);
    session.shown += 1; writeStorage(sessionStorage, SESSION_KEY, session);
    eventPayload(campaign.id, 'impression', pageType, device);
    requestAnimationFrame(function () { wrapper.classList.add('is-visible'); if (campaign.format === 'modal') close.focus({ preventScroll: true }); });
    if (campaign.format === 'modal') document.body.classList.add('dp-engagement-open');

    function dismiss(track) {
      if (!wrapper.isConnected) return;
      if (track) {
        var current = campaignState(campaign.id);
        current.state.dismissedUntil = Date.now() + campaign.frequency.cooldownHours * HOUR;
        saveCampaignState(campaign.id, current);
        eventPayload(campaign.id, 'close', pageType, device);
      }
      wrapper.classList.remove('is-visible'); document.body.classList.remove('dp-engagement-open');
      window.setTimeout(function () { wrapper.remove(); if (campaign.format === 'modal' && previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true }); }, 240);
    }

    close.addEventListener('click', function () { dismiss(true); });
    backdrop.addEventListener('click', function () { dismiss(true); });
    document.addEventListener('keydown', function onKeydown(event) {
      if (!wrapper.isConnected) { document.removeEventListener('keydown', onKeydown); return; }
      if (event.key === 'Escape') dismiss(true);
      if (event.key === 'Tab' && campaign.format === 'modal') {
        var focusable = panel.querySelectorAll('a[href], button:not([disabled]), input:not([hidden])');
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
  }

  function schedule(campaign, pageType, device, session) {
    var show = function () { if (isEligible(campaign, session)) renderCampaign(campaign, pageType, device, session); };
    if (campaign.trigger.type === 'scroll') {
      var threshold = Math.max(25, Math.min(90, campaign.trigger.value));
      var onScroll = function () {
        var available = document.documentElement.scrollHeight - window.innerHeight;
        if (available > 0 && (window.scrollY / available) * 100 >= threshold) { window.removeEventListener('scroll', onScroll); show(); }
      };
      window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    } else if (campaign.trigger.type === 'exit_intent') {
      if (device === 'mobile') return;
      var onExit = function (event) { if (event.clientY <= 8) { document.removeEventListener('mouseout', onExit); show(); } };
      document.addEventListener('mouseout', onExit);
    } else if (campaign.trigger.type === 'pageviews') {
      if (session.pageviews >= Math.max(campaign.frequency.minPageviews, campaign.trigger.value)) window.setTimeout(show, 2000);
    } else {
      window.setTimeout(show, Math.max(8, campaign.trigger.value) * 1000);
    }
  }

  function init() {
    if (!window.fetch || !window.localStorage || document.documentElement.hasAttribute('data-no-engagement')) return;
    var path = window.location.pathname;
    if (/^\/(admin|api|portal|conta|assinar|newsletter)(\/|$)/.test(path)) return;
    var session = readStorage(sessionStorage, SESSION_KEY, { pageviews: 0, shown: 0 });
    session.pageviews += 1; writeStorage(sessionStorage, SESSION_KEY, session);
    var device = deviceType();
    fetch('/api/engagement/eligible?path=' + encodeURIComponent(path) + '&device=' + device, { credentials: 'same-origin' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data || !data.success || !data.campaigns) return;
        var campaign = data.campaigns.find(function (item) { return isEligible(item, session); });
        if (campaign) schedule(campaign, data.pageType || 'other', device, session);
      }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
