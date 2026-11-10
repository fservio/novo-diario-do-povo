(() => {
  const key = 'diario.cookie-consent.v1';
  const expiry = 180 * 24 * 60 * 60 * 1000;
  const ids = new Set();
  const loaded = new Set();
  let choice = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && saved.expires > Date.now() && typeof saved.advertising === 'boolean') {
      choice = {analytics: true, advertising: saved.advertising, expires: saved.expires};
    }
  } catch {}

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  // A medição de audiência é sempre ativa. Só a publicidade personalizada depende da escolha do visitante.
  const states = value => ({
    analytics_storage: 'granted',
    ad_storage: value?.advertising ? 'granted' : 'denied',
    ad_user_data: value?.advertising ? 'granted' : 'denied',
    ad_personalization: value?.advertising ? 'granted' : 'denied'
  });
  // Regiões com exigência de consentimento prévio para publicidade (EEE, Reino Unido e Suíça): negado até a escolha.
  // Demais regiões (inclui o Brasil): permitido por padrão; o visitante pode recusar a publicidade personalizada.
  const restrictedRegions = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH'];
  window.gtag('consent', 'default', {analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted'});
  window.gtag('consent', 'default', {...states(null), region: restrictedRegions});
  if (choice) window.gtag('consent', 'update', states(choice));
  document.documentElement.toggleAttribute('data-diario-advertising', Boolean(choice?.advertising));

  function loadAnalytics(id) {
    window['ga-disable-' + id] = false;
    if (loaded.has(id)) return;
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
    allows: category => category === 'analytics' ? true : choice?.[category] === true,
    analytics(id) {
      if (!/^G-[A-Z0-9]+$/i.test(id)) return;
      ids.add(id);
      loadAnalytics(id);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.querySelector('#diario-cookie-banner');
    if (!banner) return;
    banner.hidden = Boolean(choice);

    function save(advertising) {
      const revoke = Boolean(choice?.advertising) && !advertising;
      choice = {analytics: true, advertising, expires: Date.now() + expiry};
      document.documentElement.toggleAttribute('data-diario-advertising', choice.advertising);
      let persisted = true;
      try { localStorage.setItem(key, JSON.stringify(choice)); } catch { persisted = false; }
      window.gtag('consent', 'update', states(choice));
      ids.forEach(loadAnalytics);
      window.dispatchEvent(new Event('diario:cookie-consent'));
      banner.hidden = true;
      if (revoke && persisted) window.location.reload();
    }
    banner.querySelector('[data-cookie-accept]').addEventListener('click', () => save(true));
    banner.querySelector('[data-cookie-reject]').addEventListener('click', () => save(false));
  }, {once:true});
})();
