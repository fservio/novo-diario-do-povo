(() => {
  const key = 'diario.cookie-consent.v1';
  const expiry = 180 * 24 * 60 * 60 * 1000;
  const ids = new Set();
  const loaded = new Set();
  let choice = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && saved.expires > Date.now() &&
        typeof saved.analytics === 'boolean' && typeof saved.advertising === 'boolean') choice = saved;
  } catch {}

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const states = value => ({
    analytics_storage: value?.analytics ? 'granted' : 'denied',
    ad_storage: value?.advertising ? 'granted' : 'denied',
    ad_user_data: value?.advertising ? 'granted' : 'denied',
    ad_personalization: value?.advertising ? 'granted' : 'denied'
  });
  // Regiões com exigência de consentimento prévio (EEE, Reino Unido e Suíça): negado até a escolha do visitante.
  // Demais regiões (inclui o Brasil): permitido por padrão; o visitante pode recusar a qualquer momento.
  const restrictedRegions = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH'];
  window.gtag('consent', 'default', {analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted'});
  window.gtag('consent', 'default', {...states(null), region: restrictedRegions});
  if (choice) window.gtag('consent', 'update', states(choice));
  document.documentElement.toggleAttribute('data-diario-advertising', Boolean(choice?.advertising));

  function loadAnalytics(id) {
    const refused = Boolean(choice) && !choice.analytics;
    window['ga-disable-' + id] = refused;
    if (refused || loaded.has(id)) return;
    if (!loaded.size) {
      window.gtag('js', new Date());
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
      document.head.append(script);
    }
    loaded.add(id);
    window.gtag('config', id);
  }
  window.diarioConsent = {
    allows: category => category === 'analytics' ? (choice ? choice.analytics === true : true) : choice?.[category] === true,
    analytics(id) {
      if (!/^G-[A-Z0-9]+$/i.test(id)) return;
      ids.add(id);
      loadAnalytics(id);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.querySelector('#diario-cookie-banner');
    if (!banner) return;
    const settings = banner.querySelector('[data-cookie-settings]');
    const analytics = banner.querySelector('[name="cookie-analytics"]');
    const advertising = banner.querySelector('[name="cookie-advertising"]');
    const opener = document.querySelector('#diario-cookie-preferences');
    let openedByReader = false;
    banner.hidden = Boolean(choice);
    if (opener) opener.hidden = false;

    const showSettings = () => {
      settings.hidden = false;
      analytics.checked = Boolean(choice?.analytics);
      advertising.checked = Boolean(choice?.advertising);
      analytics.focus();
    };
    opener?.addEventListener('click', () => {
      openedByReader = true;
      banner.hidden = false;
      showSettings();
    });
    banner.querySelector('[data-cookie-customize]').addEventListener('click', showSettings);

    function save(next) {
      const revoke = (choice?.advertising && !next.advertising) || (choice?.analytics && !next.analytics);
      choice = {...next, expires:Date.now() + expiry};
      document.documentElement.toggleAttribute('data-diario-advertising', choice.advertising);
      let persisted = true;
      try { localStorage.setItem(key, JSON.stringify(choice)); } catch { persisted = false; }
      ids.forEach(id => { window['ga-disable-' + id] = !choice.analytics; });
      window.gtag('consent', 'update', states(choice));
      ids.forEach(loadAnalytics);
      window.dispatchEvent(new Event('diario:cookie-consent'));
      banner.hidden = true;
      settings.hidden = true;
      if (openedByReader) opener?.focus();
      openedByReader = false;
      if (revoke && persisted) window.location.reload();
    }
    banner.querySelector('[data-cookie-accept]').addEventListener('click', () => save({analytics:true, advertising:true}));
    banner.querySelector('[data-cookie-reject]').addEventListener('click', () => save({analytics:false, advertising:false}));
    banner.querySelector('[data-cookie-save]').addEventListener('click', () => save({analytics:analytics.checked, advertising:advertising.checked}));
  }, {once:true});
})();
