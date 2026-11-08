(function () {
  'use strict';
  document.querySelectorAll('[data-seo-panel]').forEach(function (panel) {
    var form = panel.closest('form');
    if (!form) return;
    var title = panel.querySelector('[name="seo_title"]');
    var description = panel.querySelector('[name="seo_description"]');
    function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
    function refresh() {
      var headline = form.querySelector('[name="title"]');
      var excerpt = form.querySelector('[name="excerpt"]');
      var titleText = clean(title && title.value) || clean(headline && headline.value) || 'Título da matéria';
      var descriptionText = clean(description && description.value) || clean(excerpt && excerpt.value) || clean(headline && headline.value) || 'A descrição da matéria aparecerá aqui.';
      panel.querySelector('[data-seo-preview-title]').textContent = titleText + ' | ' + panel.dataset.seoBrand;
      panel.querySelector('[data-seo-preview-description]').textContent = descriptionText;
      panel.querySelectorAll('[data-seo-counter]').forEach(function (counter) {
        var field = panel.querySelector('#' + counter.dataset.seoCounter);
        if (field) counter.textContent = field.value.length + '/' + field.maxLength;
      });
    }
    form.addEventListener('input', refresh);
    refresh();
    var button = panel.querySelector('[data-seo-load-history]');
    var target = panel.querySelector('[data-seo-history-target]');
    if (!button || !target) return;
    button.addEventListener('click', async function () {
      button.disabled = true;
      target.textContent = 'Carregando histórico…';
      try {
        var response = await fetch('/admin/posts/' + panel.dataset.seoPostId + '/seo/history?fragment=1', { credentials: 'same-origin', headers: { Accept: 'text/html' } });
        if (!response.ok || response.redirected) throw new Error('history');
        var documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
        var history = documentFragment.querySelector('[data-seo-history-content]');
        if (!history) throw new Error('history');
        target.replaceChildren(document.importNode(history, true));
        button.textContent = 'Atualizar histórico';
      } catch (_) {
        target.textContent = 'Não foi possível carregar. Abra o histórico completo ou entre novamente no painel.';
      } finally { button.disabled = false; }
    });
  });
})();
