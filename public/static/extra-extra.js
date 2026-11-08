import {createGame,startGame,jumpGame,throwPaper,stepGame,pauseGame,resumeGame,deliveryTarget,ROUTE_SECONDS} from './extra-extra-engine.js'
import {drawGame} from './extra-extra-art.js'
const root=document.querySelector('[data-extra-game]')
if(root){
 const $=key=>root.querySelector('[data-extra-'+key+']'),canvas=$('canvas'),context=canvas.getContext('2d'),arena=root.querySelector('.extra-game'),start=$('start'),pause=$('pause'),jump=$('jump'),deliver=$('throw'),overlay=$('overlay'),recordKey='diario.extra-extra.record.v1'
 let game=createGame(),record=0,lastTime=0,frame=0,lastMessage='',lastMode='',recordBefore=0,cssWidth=960,cssHeight=390,dpr=1
 try{const value=Number(localStorage.getItem(recordKey));if(Number.isSafeInteger(value)&&value>=0&&value<=1000000)record=value}catch{$('storage').textContent='O navegador não permitiu ler seu recorde.'}
 if(!context){start.textContent='Jogo indisponível';$('description').textContent='Este navegador não conseguiu abrir o jogo. Experimente um navegador mais recente.'}
 else{
 function resize(){const rect=canvas.getBoundingClientRect();cssWidth=Math.max(1,rect.width);cssHeight=Math.max(1,rect.height);dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(cssWidth*dpr);canvas.height=Math.round(cssHeight*dpr);game.width=cssWidth/cssHeight*400;drawGame(context,game,cssWidth,cssHeight,dpr)}
 function renderHud(){
  $('score').textContent=String(game.score).padStart(4,'0');$('deliveries').textContent=String(game.deliveries).padStart(2,'0');$('record').textContent=String(record).padStart(4,'0');$('lives').textContent=Array.from({length:3},(_,i)=>i<game.lives?'●':'○').join(' ');$('lives').setAttribute('aria-label',game.lives+' chances');$('progress').style.width=game.time/ROUTE_SECONDS*100+'%'
  const ready=!!deliveryTarget(game)&&game.mode==='running';deliver.classList.toggle('is-ready',ready)
  const message=game.messageFor>0?game.message:ready?'Jornal aqui! Toque em Entregar.':'Olhe a rua e espere a próxima caixa sinalizar.'
  if(message!==lastMessage){$('feedback').textContent=message;lastMessage=message}
  if(game.mode!==lastMode){
   const running=game.mode==='running';pause.disabled=game.mode==='ready'||game.mode==='over';pause.textContent=game.mode==='paused'?'▶':'Ⅱ';pause.setAttribute('aria-label',game.mode==='paused'?'Continuar jogo':'Pausar jogo');jump.disabled=!running;deliver.disabled=!running;overlay.hidden=running
   if(game.mode==='paused'){$('eyebrow').textContent='PAUSA PARA RESPIRAR';$('title').textContent='Sua rota está esperando.';$('description').textContent='Continue quando quiser. O tempo está parado.';start.textContent='Continuar a rota →';$('results').hidden=true;start.focus({preventScroll:true})}
   if(game.mode==='over'){
    const finished=game.time>=ROUTE_SECONDS,newRecord=game.score>recordBefore
    $('eyebrow').textContent=newRecord?'RECORDE NOVO. EXTRA! EXTRA!':'BOA HISTÓRIA, PRÓXIMA EDIÇÃO.';$('title').textContent=finished?'Edição entregue!':'Fim da rota!';$('description').textContent=`${game.deliveries} jornais entregues. ${game.score} pontos. ${finished?'A cidade ficou mais informada.':'A próxima rua pode ser sua melhor história.'}`;start.textContent='Jogar de novo →';$('results').hidden=false
    if(game.score>record){record=game.score;$('record').textContent=String(record).padStart(4,'0');try{localStorage.setItem(recordKey,String(record))}catch{$('storage').textContent='Seu recorde vale nesta página; não foi possível guardá-lo no navegador.'}}
    start.focus({preventScroll:true})
   }
   lastMode=game.mode
  }
 }
 function loop(time){const dt=lastTime?(time-lastTime)/1000:0;lastTime=time;stepGame(game,dt);drawGame(context,game,cssWidth,cssHeight,dpr);renderHud();if(game.mode==='running')frame=requestAnimationFrame(loop);else frame=0}
 function run(){if(frame)cancelAnimationFrame(frame);lastTime=0;renderHud();frame=requestAnimationFrame(loop)}
 start.addEventListener('click',()=>{if(game.mode==='paused')resumeGame(game);else{recordBefore=record;startGame(game);$('share-status').textContent='';$('share-text').hidden=true}arena.focus({preventScroll:true});if(window.matchMedia('(max-width:720px)').matches)arena.scrollIntoView({block:'start',behavior:'instant'});run()})
 pause.addEventListener('click',()=>{if(game.mode==='running'){pauseGame(game);if(frame)cancelAnimationFrame(frame);frame=0;renderHud()}else if(game.mode==='paused'){resumeGame(game);arena.focus({preventScroll:true});run()}})
 jump.addEventListener('click',()=>{jumpGame(game);arena.focus({preventScroll:true})});deliver.addEventListener('click',()=>{throwPaper(game);arena.focus({preventScroll:true})})
 root.addEventListener('keydown',event=>{if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.ctrlKey||event.metaKey||event.altKey)return;const key=event.key.toLowerCase();if(game.mode==='running'&&[' ','arrowup','j','arrowright','p','escape'].includes(key)){event.preventDefault();if(event.repeat)return;if(key===' '||key==='arrowup')jumpGame(game);else if(key==='j'||key==='arrowright')throwPaper(game);else{pauseGame(game);renderHud()}}})
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&pauseGame(game)){if(frame)cancelAnimationFrame(frame);frame=0;renderHud()}})
 window.addEventListener('blur',()=>{if(pauseGame(game)){if(frame)cancelAnimationFrame(frame);frame=0;renderHud()}})
 $('share').addEventListener('click',async()=>{
  const text=`Entreguei ${game.deliveries} jornais e fiz ${game.score} pontos no Extra! Extra!, do Diário do Povo. Você consegue superar?`,url='https://diario.dopovo.com.br/jogos/extra-extra'
  try{if(navigator.share){await navigator.share({title:'Extra! Extra!',text,url});return}if(navigator.clipboard){await navigator.clipboard.writeText(text+' '+url);$('share-status').textContent='Pontuação copiada. Compartilhe onde quiser.';return}}catch(error){if(error.name==='AbortError')return}
  $('share-text').value=text+' '+url;$('share-text').hidden=false;$('share-text').focus();$('share-text').select();$('share-status').textContent='Copie o texto abaixo para compartilhar.'
 })
 start.disabled=false;start.textContent='Bora entregar! →';resize();renderHud();window.addEventListener('resize',resize)
 }
}
