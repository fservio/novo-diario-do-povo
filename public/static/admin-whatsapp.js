(function(){
  var form=document.querySelector('[data-wa-campaign-form]');if(!form)return;
  var post=form.querySelector('[data-wa-post]'),title=form.querySelector('[data-wa-title]'),body=form.querySelector('[data-wa-body]'),url=form.querySelector('[data-wa-url]');
  var pTitle=form.querySelector('[data-wa-preview-title]'),pBody=form.querySelector('[data-wa-preview-body]'),pUrl=form.querySelector('[data-wa-preview-url]');
  function preview(){pTitle.textContent=title.value||'Título da notícia';pBody.textContent=body.value||'O resumo editorial aparecerá aqui.';pUrl.textContent=url.value||'diario.dopovo.com.br'}
  post.addEventListener('change',function(){var option=post.options[post.selectedIndex];if(!option||!option.value)return;title.value=option.dataset.title||'';body.value=option.dataset.body||'';url.value=option.dataset.url||'';form.querySelector('[name=title]').value='WhatsApp · '+(option.dataset.title||'');preview()});
  [title,body,url].forEach(function(input){input.addEventListener('input',preview)});preview();
})();
