import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {writeFile} from 'node:fs/promises'
const bundled=createRequire('C:/Users/fabio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'),{chromium}=bundled('playwright')
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--disable-gpu']}),report=[]
try{for(const width of [1440,390,320]){
 const page=await browser.newPage({viewport:{width,height:950}})
 await page.route(/^https?:\/\//,route=>route.abort())
 for(const name of ['admin','new','editor','library','guide']){
  await page.goto(pathToFileURL(resolve('artifacts/guias-evergreen/'+name+'.html')).href,{waitUntil:'domcontentloaded'})
  await page.waitForLoadState('load')
  const result=await page.evaluate(()=>{const area=document.querySelector('.guides-admin')||document.querySelector('.guide-page');return {viewport:innerWidth,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,areaWidth:area.getBoundingClientRect().width,fields:[...area.querySelectorAll('input:not([type=hidden]),textarea,select,button')].filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.height&&(b.left<0||b.right>innerWidth+1)}).map(e=>e.outerHTML.slice(0,140)),h1:area.querySelector('h1').textContent}})
  report.push({name,width,...result});if(width!==320&&['admin','guide','editor'].includes(name))await page.screenshot({path:'artifacts/guias-evergreen/'+name+'-'+width+'.png',fullPage:false,animations:'disabled',timeout:15000})
  if(result.width>width+1||result.fields.length){result.overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,100),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(b=>b.right>innerWidth+1&&b.left>=0).slice(-18));throw Error('Layout overflow '+name+' '+width+': '+JSON.stringify(result))}
 }
 await page.close()
}}finally{await browser.close();await writeFile('artifacts/guias-evergreen/visual-check.json',JSON.stringify(report,null,2))}
console.log(JSON.stringify(report))
