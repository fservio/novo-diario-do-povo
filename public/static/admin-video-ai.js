(function () {
  'use strict';

  var projectForm = document.querySelector('[data-video-project-form]');
  if (projectForm) initializeProjectForm(projectForm);

  var scriptForm = document.querySelector('[data-video-script-form]');
  if (scriptForm) initializeScriptWorkspace(scriptForm);

  var versionSelect = document.querySelector('[data-video-version-select]');
  if (versionSelect) versionSelect.addEventListener('change', function () {
    var url = new URL(window.location.href); url.searchParams.set('version', versionSelect.value); window.location.assign(url.toString());
  });

  function initializeProjectForm(form) {
    var picker = form.querySelector('[data-video-post-picker]');
    var search = form.querySelector('[data-video-post-search]');
    var dropdown = form.querySelector('[data-video-post-dropdown]');
    var results = form.querySelector('[data-video-post-results]');
    var status = form.querySelector('[data-video-post-status]');
    var postId = form.querySelector('[data-video-post-id]');
    var selection = form.querySelector('[data-video-post-selection]');
    var title = form.querySelector('[data-video-post-title]');
    var internalTitle = form.querySelector('[name="internal_title"]');
    var clear = form.querySelector('[data-video-post-clear]');
    var postError = form.querySelector('[data-video-post-error]');
    var avatarError = form.querySelector('[data-video-avatar-error]');
    var format = form.querySelector('[name="format"]');
    var timer = null; var requestId = 0; var options = [];

    function openDropdown(open) { dropdown.hidden = !open; search.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    function choose(option) {
      postId.value = option.dataset.postId || ''; title.textContent = option.dataset.title || '';
      selection.hidden = false; search.parentElement.hidden = true; postError.hidden = true; openDropdown(false);
      if (!internalTitle.value.trim()) internalTitle.value = 'Vídeo · ' + (option.dataset.title || '').slice(0, 160);
    }
    function bindOptions() {
      options = Array.from(results.querySelectorAll('[data-video-post]'));
      options.forEach(function (option) {
        option.addEventListener('click', function () { choose(option); });
        option.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') { openDropdown(false); search.focus(); return; }
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault(); var index = options.indexOf(option);
          options[event.key === 'ArrowDown' ? Math.min(index + 1, options.length - 1) : Math.max(index - 1, 0)].focus();
        });
      });
    }
    function formatDate(value) {
      if (!value) return '';
      var date = new Date(value); if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    function render(items) {
      results.replaceChildren();
      items.forEach(function (item) {
        var button = document.createElement('button'); button.type = 'button'; button.className = 'video-post-option'; button.setAttribute('role', 'option'); button.dataset.videoPost = ''; button.dataset.postId = item.id; button.dataset.title = item.title || '';
        var eyebrow = document.createElement('span'); eyebrow.textContent = item.hat || item.category_name || 'Matéria';
        var headline = document.createElement('strong'); headline.textContent = item.title || '';
        var date = document.createElement('small'); date.textContent = formatDate(item.published_at || item.created_at);
        button.append(eyebrow, headline, date); results.appendChild(button);
      });
      bindOptions(); status.textContent = items.length ? items.length + ' matéria(s) encontrada(s). Selecione uma opção.' : 'Nenhuma matéria encontrada.';
    }
    function load(query) {
      var current = ++requestId; status.textContent = query ? 'Pesquisando no acervo…' : 'Carregando matérias recentes…';
      fetch('/api/admin/video-ia/posts?q=' + encodeURIComponent(query || '') + '&limit=15', { credentials: 'same-origin' })
        .then(function (response) { if (!response.ok) throw new Error(); return response.json(); })
        .then(function (payload) { if (current !== requestId || !payload.success) return; render(payload.results || []); })
        .catch(function () { if (current === requestId) status.textContent = 'Não foi possível pesquisar as matérias.'; });
    }

    bindOptions();
    search.addEventListener('focus', function () { openDropdown(true); });
    search.addEventListener('click', function () { openDropdown(true); });
    search.addEventListener('input', function () { openDropdown(true); window.clearTimeout(timer); timer = window.setTimeout(function () { load(search.value.trim()); }, 250); });
    search.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { openDropdown(false); return; }
      if (event.key === 'ArrowDown' && options.length) { event.preventDefault(); openDropdown(true); options[0].focus(); }
    });
    clear.addEventListener('click', function () {
      postId.value = ''; selection.hidden = true; search.parentElement.hidden = false; search.value = ''; load(''); openDropdown(true); search.focus();
    });
    document.addEventListener('click', function (event) { if (!picker.contains(event.target)) openDropdown(false); });
    form.addEventListener('submit', function (event) {
      var selectedAvatars = Array.from(form.querySelectorAll('[name$="_avatar_id"]')).filter(function (select) { return Boolean(select.value); });
      var invalidCommentary = format.value === 'commentary' && !form.querySelector('[name="commentator_avatar_id"]').value;
      postError.hidden = Boolean(postId.value); avatarError.hidden = selectedAvatars.length > 0 && !invalidCommentary;
      if (!postId.value || !selectedAvatars.length || invalidCommentary) {
        event.preventDefault(); (postId.value ? form.querySelector('[name$="_avatar_id"]') : search).focus();
      }
    });
  }

  function initializeScriptWorkspace(form) {
    var dialogues = Array.from(form.querySelectorAll('[data-video-dialogue]'));
    var wordOutput = form.querySelector('[data-video-word-count]');
    var durationOutput = form.querySelector('[data-video-duration]');
    function updateMetrics() {
      var count = dialogues.reduce(function (total, field) { return total + field.value.trim().split(/\s+/).filter(Boolean).length; }, 0);
      wordOutput.textContent = String(count); durationOutput.textContent = String(Math.max(1, Math.round((count / 140) * 60)));
    }
    dialogues.forEach(function (field) { field.addEventListener('input', updateMetrics); });
  }

  function buildCopyText(role) {
    var segments = Array.from(document.querySelectorAll('[data-video-segment]')).filter(function (segment) { return role === 'all' || segment.dataset.speakerRole === role; });
    return segments.map(function (segment) {
      var select = segment.querySelector('[name^="speaker_role_"]');
      var currentRole = select ? select.value : segment.dataset.speakerRole;
      if (role !== 'all' && currentRole !== role) return '';
      var name = select && select.selectedIndex >= 0 ? select.options[select.selectedIndex].textContent.replace(/^.*? · /, '') : segment.dataset.speakerName || currentRole;
      var dialogue = segment.querySelector('[data-video-dialogue]').value.trim();
      return name.toUpperCase() + '\n' + dialogue;
    }).filter(Boolean).join('\n\n');
  }

  document.querySelectorAll('[data-video-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var status = document.querySelector('[data-video-copy-status]');
      navigator.clipboard.writeText(buildCopyText(button.dataset.videoCopy)).then(function () {
        status.textContent = 'Roteiro copiado para a área de transferência.';
      }).catch(function () { status.textContent = 'Não foi possível copiar automaticamente. Selecione o texto manualmente.'; });
    });
  });
})();
