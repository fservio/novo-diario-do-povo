(function () {
  'use strict';

  var form = document.querySelector('[data-engagement-form]');
  if (!form) return;

  var preview = form.querySelector('[data-engagement-preview]');
  var previewCampaign = preview ? preview.querySelector('.engagement-admin-preview__campaign') : null;
  var typeInputs = Array.from(form.querySelectorAll('input[name="campaign_type"]'));
  var formatInput = form.querySelector('[name="display_format"]');
  var postInput = form.querySelector('[data-post-id]');
  var postSearch = form.querySelector('[data-post-search]');
  var postPicker = form.querySelector('[data-post-picker]');
  var postCombobox = form.querySelector('.engagement-post-combobox');
  var postDropdown = form.querySelector('[data-post-dropdown]');
  var postResults = form.querySelector('[data-post-results]');
  var postOptions = Array.from(form.querySelectorAll('[data-post-option]'));
  var postSelection = form.querySelector('[data-post-selection]');
  var postError = form.querySelector('[data-post-error]');
  var imageEditor = form.querySelector('[data-image-editor]');
  var imageIdInput = form.querySelector('[data-image-media-id]');
  var focalX = form.querySelector('[data-focal="x"]');
  var focalY = form.querySelector('[data-focal="y"]');
  var focalControls = form.querySelector('[data-focal-controls]');
  var mediaModal = form.querySelector('[data-media-modal]');
  var mediaGrid = form.querySelector('[data-media-grid]');
  var mediaStatus = form.querySelector('[data-media-status]');
  var mediaSearch = form.querySelector('[data-media-search]');
  var uploadPanel = form.querySelector('[data-upload-panel]');
  var csrfInput = form.querySelector('input[name="csrf"]');
  var initialized = false;
  var searchTimer = null;
  var postSearchTimer = null;
  var postSearchRequest = 0;
  var selectedPostOption = null;

  var defaults = {
    newsletter: { eyebrow: 'Newsletter do Diário', title: 'Informação de confiança, direto no seu e-mail.', body: 'Receba uma seleção das notícias mais importantes do dia.', cta_label: 'Quero receber' },
    editorial: { eyebrow: 'Destaque', title: 'Uma reportagem que merece sua atenção.', body: 'Leia a cobertura completa no Diário do Povo.', cta_label: 'Ler matéria' },
    instagram: { eyebrow: 'Siga o Diário', title: 'O Diário do Povo também está no Instagram.', body: 'Acompanhe notícias, bastidores e conteúdos exclusivos.', cta_label: 'Seguir no Instagram' },
    advertising: { eyebrow: 'Publicidade', title: 'Conheça esta novidade.', body: 'Uma mensagem apresentada por nosso parceiro.', cta_label: 'Saiba mais' }
  };

  function selectedType() {
    var checked = typeInputs.find(function (input) { return input.checked; });
    return checked ? checked.value : 'newsletter';
  }

  function field(name) { return form.elements[name]; }

  function isDefaultCopy(value, key) {
    if (!String(value || '').trim()) return true;
    return Object.keys(defaults).some(function (type) { return defaults[type][key] === value; });
  }

  function setModePanel(panel, active) {
    panel.hidden = !active;
    panel.querySelectorAll('input, select, textarea, button').forEach(function (control) {
      if (control.type === 'button') return;
      control.disabled = !active;
      if (control.dataset.required === 'true') control.required = active;
    });
  }

  function updateCopy(input) {
    if (!preview) return;
    var target = preview.querySelector('[data-preview-' + input.dataset.previewInput + ']');
    if (target && input.dataset.previewInput !== 'cta') target.textContent = input.value;
    if (input.dataset.previewInput === 'cta') rebuildPreviewAction();
  }

  function rebuildPreviewAction() {
    if (!preview) return;
    var action = preview.querySelector('[data-preview-action]');
    if (!action) return;
    action.replaceChildren();
    if (selectedType() === 'newsletter') {
      var email = document.createElement('span');
      email.className = 'engagement-admin-preview__email'; email.textContent = 'seu@email.com';
      var submit = document.createElement('span');
      submit.className = 'engagement-admin-preview__cta'; submit.textContent = field('cta_label').value || 'Quero receber';
      var consent = document.createElement('span');
      consent.className = 'engagement-admin-preview__consent'; consent.textContent = '□ Aceito a Política de Privacidade';
      action.append(email, submit, consent);
    } else {
      var cta = document.createElement('span');
      cta.className = 'engagement-admin-preview__cta'; cta.textContent = field('cta_label').value || 'Saiba mais';
      action.appendChild(cta);
    }
  }

  function updateAdvertisingPreview() {
    if (!preview) return;
    var sponsored = preview.querySelector('[data-preview-sponsored]');
    var advertiser = preview.querySelector('[data-preview-advertiser]');
    var isAdvertising = selectedType() === 'advertising';
    if (sponsored) sponsored.hidden = !isAdvertising;
    if (advertiser) {
      var name = field('advertiser_name') && field('advertiser_name').value.trim();
      advertiser.hidden = !isAdvertising || !name;
      advertiser.textContent = name ? 'Conteúdo de ' + name : '';
    }
  }

  function applyMode(fromUser) {
    var type = selectedType();
    form.querySelectorAll('[data-mode-panel]').forEach(function (panel) {
      var modes = String(panel.dataset.modePanel || '').split(/\s+/);
      setModePanel(panel, modes.indexOf(type) >= 0);
    });

    var destinationLabel = form.querySelector('[data-destination-label]');
    var destinationHelp = form.querySelector('[data-destination-help]');
    var destination = field('cta_url');
    if (type === 'advertising') {
      destinationLabel.textContent = 'Link da campanha';
      destinationHelp.textContent = 'Use um endereço HTTPS completo do anunciante ou da página de campanha.';
      destination.placeholder = 'https://www.anunciante.com.br/campanha';
    } else if (type === 'instagram') {
      destinationLabel.textContent = 'Link do Instagram';
      destinationHelp.textContent = 'Use o endereço completo do perfil, reel ou publicação.';
      destination.placeholder = 'https://www.instagram.com/diariodopovo/';
    }

    if (fromUser) {
      Object.keys(defaults[type]).forEach(function (key) {
        var control = field(key);
        if (control && isDefaultCopy(control.value, key)) control.value = defaults[type][key];
      });
      if (type !== 'editorial' && imageEditor && imageEditor.dataset.imageSource === 'post') setImage(null);
    }
    var postCoverButton = imageEditor && imageEditor.querySelector('[data-image-action="post"]');
    if (postCoverButton) postCoverButton.hidden = type !== 'editorial' || !selectedPost();

    if (preview) {
      preview.className = preview.className.replace(/\bis-(newsletter|editorial|instagram|advertising)\b/g, '').trim() + ' is-' + type;
      if (previewCampaign) previewCampaign.className = previewCampaign.className.replace(/\bis-(newsletter|editorial|instagram|advertising)\b/g, '').trim() + ' is-' + type;
      var eyebrow = preview.querySelector('[data-preview-eyebrow]');
      if (eyebrow) eyebrow.textContent = field('eyebrow').value.trim() || (type === 'advertising' ? 'Publicidade' : 'Diário do Povo');
    }
    form.querySelectorAll('[data-preview-input]').forEach(updateCopy);
    rebuildPreviewAction();
    updateAdvertisingPreview();
    initialized = true;
  }

  function updateFormat() {
    if (!preview || !formatInput) return;
    preview.className = preview.className.replace(/\bis-(banner|slide_in|modal)\b/g, '').trim() + ' is-' + formatInput.value;
  }

  function selectedPost() {
    if (selectedPostOption) return selectedPostOption;
    if (!postInput || !postInput.value) return null;
    return postOptions.find(function (option) { return option.dataset.postId === postInput.value; }) || null;
  }

  function setPreviewImage(url) {
    if (!previewCampaign) return;
    var current = previewCampaign.querySelector('[data-preview-image]');
    if (!current) return;
    if (url) {
      if (current.tagName !== 'IMG') {
        var image = document.createElement('img'); image.dataset.previewImage = ''; image.alt = '';
        current.replaceWith(image); current = image;
      }
      current.src = url;
      current.style.objectPosition = focalX.value + '% ' + focalY.value + '%';
    } else if (current.tagName === 'IMG') {
      var empty = document.createElement('div'); empty.className = 'engagement-admin-preview__image'; empty.dataset.previewImage = '';
      current.replaceWith(empty);
    }
  }

  function setImage(media) {
    if (!imageEditor) return;
    var visual = imageEditor.querySelector('[data-image-visual]');
    var name = imageEditor.querySelector('[data-image-name]');
    var meta = imageEditor.querySelector('[data-image-meta]');
    var remove = imageEditor.querySelector('[data-image-action="remove"]');
    var url = media && media.url ? media.url : '';
    var source = media && media.source ? media.source : 'none';
    imageEditor.dataset.imageSource = source;
    imageIdInput.value = source === 'custom' && media.id ? String(media.id) : '';
    visual.replaceChildren();
    if (url) {
      var image = document.createElement('img');
      image.src = url; image.alt = ''; image.dataset.selectedImage = '';
      image.style.objectPosition = focalX.value + '% ' + focalY.value + '%';
      visual.appendChild(image);
    } else {
      var placeholder = document.createElement('div'); placeholder.dataset.imagePlaceholder = '';
      var placeholderTitle = document.createElement('span'); placeholderTitle.textContent = 'Imagem opcional';
      var placeholderHelp = document.createElement('small'); placeholderHelp.textContent = 'Envie uma nova imagem ou escolha na biblioteca';
      placeholder.append(placeholderTitle, placeholderHelp); visual.appendChild(placeholder);
    }
    name.textContent = url ? (media.name || 'Imagem selecionada') : 'Nenhuma imagem selecionada';
    meta.textContent = url ? (media.meta || '') : '';
    remove.hidden = !url;
    focalControls.hidden = !url;
    setPreviewImage(url);
  }

  function usePostCover() {
    var option = selectedPost();
    if (!option || !option.dataset.imageUrl) {
      setImage(null);
      var meta = imageEditor.querySelector('[data-image-meta]');
      if (option) meta.textContent = 'A matéria selecionada não possui foto de capa.';
      return;
    }
    setImage({ url: option.dataset.imageUrl, source: 'post', name: 'Capa da matéria selecionada', meta: 'A imagem acompanhará futuras alterações na capa da matéria.' });
  }

  function applySelectedPost(option) {
    option = option || selectedPost();
    var postButton = imageEditor && imageEditor.querySelector('[data-image-action="post"]');
    if (postButton) postButton.hidden = !option;
    if (!option) return;
    field('title').value = option.dataset.title || '';
    field('body').value = option.dataset.body || '';
    field('eyebrow').value = option.dataset.eyebrow || 'Destaque';
    field('cta_label').value = 'Ler matéria';
    form.querySelectorAll('[data-preview-input]').forEach(updateCopy);
    usePostCover();
  }

  function choosePost(option, applyContent) {
    if (!option || !postInput) return;
    selectedPostOption = option;
    postInput.value = option.dataset.postId || '';
    postOptions.forEach(function (item) {
      var selected = item === option;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    if (postSearch) postSearch.value = option.dataset.title || '';
    if (postCombobox) postCombobox.hidden = true;
    if (postSelection) {
      postSelection.hidden = false;
      postSelection.querySelector('[data-post-selection-title]').textContent = option.dataset.title || option.textContent.trim();
    }
    if (postError) postError.hidden = true;
    setPostDropdown(false);
    if (applyContent) applySelectedPost(option);
  }

  function clearPost() {
    if (!postInput) return;
    selectedPostOption = null;
    postInput.value = '';
    postOptions.forEach(function (option) { option.classList.remove('is-selected'); option.setAttribute('aria-selected', 'false'); });
    if (postSelection) postSelection.hidden = true;
    if (postCombobox) postCombobox.hidden = false;
    var postButton = imageEditor && imageEditor.querySelector('[data-image-action="post"]');
    if (postButton) postButton.hidden = true;
    if (imageEditor && imageEditor.dataset.imageSource === 'post') setImage(null);
    postSearch.value = '';
    loadPostOptions('');
    setPostDropdown(true);
    postSearch.focus();
  }

  function setPostDropdown(open) {
    if (!postDropdown || !postSearch) return;
    postDropdown.hidden = !open;
    postSearch.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function bindPostOptions() {
    postOptions = Array.from(form.querySelectorAll('[data-post-option]'));
    postOptions.forEach(function (option) {
      option.addEventListener('click', function () { choosePost(option, true); });
      option.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { setPostDropdown(false); postSearch.focus(); return; }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        var index = postOptions.indexOf(option);
        postOptions[event.key === 'ArrowDown' ? Math.min(index + 1, postOptions.length - 1) : Math.max(index - 1, 0)].focus();
      });
    });
  }

  function formatPostDate(value) {
    if (!value) return '';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderPostOptions(items) {
    if (!postResults) return;
    postResults.replaceChildren();
    items.forEach(function (item) {
      var option = document.createElement('button');
      option.type = 'button'; option.className = 'engagement-post-option'; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
      option.dataset.postOption = ''; option.dataset.postId = String(item.id); option.dataset.title = item.title || ''; option.dataset.body = item.excerpt || '';
      option.dataset.eyebrow = item.hat || item.category_name || 'Destaque'; option.dataset.url = item.url || ''; option.dataset.imageUrl = item.image_url || ''; option.dataset.imageId = item.cover_media_id || '';
      var eyebrow = document.createElement('span'); eyebrow.textContent = item.hat || item.category_name || 'Matéria';
      var title = document.createElement('strong'); title.textContent = item.title || '';
      var date = document.createElement('small'); date.textContent = formatPostDate(item.published_at || item.created_at);
      option.append(eyebrow, title, date); postResults.appendChild(option);
    });
    bindPostOptions();
    var result = form.querySelector('[data-post-result]');
    if (!result) return;
    result.textContent = items.length ? items.length + ' matéria(s) encontrada(s). Selecione uma opção.' : 'Nenhuma matéria encontrada. Tente outro termo.';
  }

  function loadPostOptions(query) {
    if (!postResults) return;
    var request = ++postSearchRequest;
    var result = form.querySelector('[data-post-result]');
    if (result) result.textContent = query ? 'Pesquisando no acervo…' : 'Carregando matérias recentes…';
    fetch('/api/admin/engagement/posts?q=' + encodeURIComponent(query || '') + '&limit=15', { credentials: 'same-origin' })
      .then(function (response) { if (!response.ok) throw new Error(); return response.json(); })
      .then(function (payload) {
        if (request !== postSearchRequest) return;
        if (!payload.success) throw new Error();
        renderPostOptions(payload.results || []);
      })
      .catch(function () {
        if (request !== postSearchRequest) return;
        if (result) result.textContent = 'Não foi possível pesquisar as matérias. Tente novamente.';
      });
  }

  function updateFocal() {
    var position = focalX.value + '% ' + focalY.value + '%';
    var selected = imageEditor && imageEditor.querySelector('[data-selected-image]');
    var previewImage = preview && preview.querySelector('img[data-preview-image]');
    if (selected) selected.style.objectPosition = position;
    if (previewImage) previewImage.style.objectPosition = position;
    form.querySelector('[data-focal-output="x"]').textContent = focalX.value + '%';
    form.querySelector('[data-focal-output="y"]').textContent = focalY.value + '%';
  }

  function showUploadPanel(show) {
    uploadPanel.hidden = !show;
    if (show) form.querySelector('[data-upload-file]').focus();
  }

  function uploadImage() {
    var fileInput = form.querySelector('[data-upload-file]');
    var altInput = form.querySelector('[data-upload-alt]');
    var creditsInput = form.querySelector('[data-upload-credits]');
    var submit = form.querySelector('[data-upload-submit]');
    var status = form.querySelector('[data-upload-status]');
    if (!fileInput.files.length) { status.textContent = 'Selecione um arquivo de imagem.'; return; }
    if (altInput.value.trim().length < 3) { status.textContent = 'Informe uma descrição acessível da imagem.'; altInput.focus(); return; }
    var data = new FormData();
    data.append('file', fileInput.files[0]); data.append('alt', altInput.value.trim()); data.append('credits', creditsInput.value.trim()); data.append('purpose', 'engagement-campaign');
    submit.disabled = true; submit.textContent = 'Enviando…'; status.textContent = 'Enviando e processando a imagem…';
    fetch('/api/admin/media/upload', { method: 'POST', headers: { 'X-CSRF-Token': csrfInput.value }, credentials: 'same-origin', body: data })
      .then(function (response) { return response.json().then(function (payload) { return { ok: response.ok, payload: payload }; }); })
      .then(function (result) {
        if (!result.ok || !result.payload.success) throw new Error(result.payload.error || 'Não foi possível enviar a imagem.');
        var media = result.payload.media;
        setImage({ id: media.id, url: media.url + '?w=900', source: 'custom', name: media.filename || media.alt, meta: media.credits ? 'Crédito: ' + media.credits : 'Imagem enviada para a Biblioteca de mídia' });
        status.textContent = 'Imagem enviada e aplicada à campanha.'; fileInput.value = ''; altInput.value = ''; creditsInput.value = '';
        window.setTimeout(function () { showUploadPanel(false); status.textContent = ''; }, 900);
      }).catch(function (error) { status.textContent = error.message || 'Não foi possível enviar a imagem.'; })
      .finally(function () { submit.disabled = false; submit.textContent = 'Enviar e usar imagem'; });
  }

  function openMediaModal() {
    mediaModal.hidden = false; document.body.classList.add('engagement-media-open');
    loadMedia(mediaSearch.value); window.setTimeout(function () { mediaSearch.focus(); }, 0);
  }

  function closeMediaModal() {
    mediaModal.hidden = true; document.body.classList.remove('engagement-media-open');
  }

  function renderMedia(items) {
    mediaGrid.replaceChildren();
    var images = items.filter(function (item) { return String(item.mime_type || '').indexOf('image/') === 0; });
    mediaStatus.textContent = images.length ? images.length + ' imagem(ns) encontrada(s)' : 'Nenhuma imagem encontrada.';
    images.forEach(function (item) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'engagement-media-item';
      var image = document.createElement('img'); image.src = '/i/' + item.r2_key + '?w=360'; image.alt = item.alt || '';
      var copy = document.createElement('span');
      var title = document.createElement('strong'); title.textContent = item.alt || item.filename;
      var detail = document.createElement('small'); detail.textContent = item.credits || item.filename;
      copy.append(title, detail); button.append(image, copy);
      button.addEventListener('click', function () {
        setImage({ id: item.id, url: '/i/' + item.r2_key + '?w=900', source: 'custom', name: item.alt || item.filename, meta: item.credits ? 'Crédito: ' + item.credits : item.filename });
        closeMediaModal();
      });
      mediaGrid.appendChild(button);
    });
  }

  function loadMedia(query) {
    mediaStatus.textContent = 'Buscando imagens…'; mediaGrid.replaceChildren();
    fetch('/api/admin/media/search?q=' + encodeURIComponent(query || '') + '&limit=60', { credentials: 'same-origin' })
      .then(function (response) { if (!response.ok) throw new Error(); return response.json(); })
      .then(function (payload) { if (!payload.success) throw new Error(); renderMedia(payload.results || []); })
      .catch(function () { mediaStatus.textContent = 'Não foi possível carregar a biblioteca.'; });
  }

  typeInputs.forEach(function (input) { input.addEventListener('change', function () { applyMode(initialized); }); });
  if (formatInput) formatInput.addEventListener('change', updateFormat);
  form.querySelectorAll('[data-preview-input]').forEach(function (input) { input.addEventListener('input', function () { updateCopy(input); }); });
  if (field('advertiser_name')) field('advertiser_name').addEventListener('input', updateAdvertisingPreview);
  bindPostOptions();
  if (postSearch) {
    postSearch.addEventListener('focus', function () { setPostDropdown(true); });
    postSearch.addEventListener('click', function () { setPostDropdown(true); });
    postSearch.addEventListener('input', function () {
      setPostDropdown(true);
      window.clearTimeout(postSearchTimer);
      postSearchTimer = window.setTimeout(function () { loadPostOptions(postSearch.value.trim()); }, 250);
    });
    postSearch.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { setPostDropdown(false); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
      var options = postOptions.filter(function (option) { return !option.hidden; });
      if (!options.length) return;
      var focused = options.indexOf(document.activeElement);
      if (event.key === 'Enter' && focused >= 0) { event.preventDefault(); choosePost(options[focused], true); return; }
      if (event.key === 'Enter') return;
      event.preventDefault(); setPostDropdown(true);
      options[event.key === 'ArrowDown' ? Math.min(focused + 1, options.length - 1) : Math.max(focused - 1, 0)].focus();
    });
  }
  var postClear = form.querySelector('[data-post-clear]');
  if (postClear) postClear.addEventListener('click', clearPost);
  if (focalX) focalX.addEventListener('input', updateFocal);
  if (focalY) focalY.addEventListener('input', updateFocal);
  form.querySelector('[data-image-action="upload"]').addEventListener('click', function () { showUploadPanel(true); });
  form.querySelector('[data-image-action="library"]').addEventListener('click', openMediaModal);
  form.querySelector('[data-image-action="post"]').addEventListener('click', usePostCover);
  form.querySelector('[data-image-action="remove"]').addEventListener('click', function () { setImage(null); });
  form.querySelector('[data-upload-cancel]').addEventListener('click', function () { showUploadPanel(false); });
  form.querySelector('[data-upload-submit]').addEventListener('click', uploadImage);
  form.querySelector('[data-upload-file]').addEventListener('change', function (event) {
    var alt = form.querySelector('[data-upload-alt]'); var file = event.target.files[0];
    if (file && !alt.value) alt.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  });
  form.querySelectorAll('[data-media-close]').forEach(function (button) { button.addEventListener('click', closeMediaModal); });
  mediaSearch.addEventListener('input', function () { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(function () { loadMedia(mediaSearch.value); }, 250); });
  document.addEventListener('click', function (event) { if (postPicker && !postPicker.contains(event.target)) setPostDropdown(false); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !mediaModal.hidden) closeMediaModal(); });
  form.addEventListener('submit', function (event) {
    if (selectedType() !== 'editorial' || (postInput && postInput.value)) return;
    event.preventDefault();
    if (postError) postError.hidden = false;
    postSearch.focus();
  });

  if (selectedPost()) choosePost(selectedPost(), false);
  setPostDropdown(false); applyMode(false); updateFormat(); updateFocal();
})();
