import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='artifacts/posts-pagination-release';
const target='artifacts/seo-home-release';
const manifest=JSON.parse(await readFile(`${base}/manifest.json`,'utf8'));
for(const file of manifest.files){const hash=createHash('sha256').update(await readFile(`${base}/site/${file.path}`)).digest('hex');if(hash!==file.sha256)throw Error(`Base mismatch: ${file.path}`)}
await mkdir(target,{recursive:true});
await cp(`${base}/site`,`${target}/site`,{recursive:true,force:false,errorOnExist:true});
let worker=await readFile(`${target}/site/_worker.js`,'utf8');
const description='Acompanhe no Diário do Povo as notícias do Piauí, do Brasil e do mundo, com informação, análises e serviço público para o seu dia a dia.';
const replacements=[[' — Notícias de Fortaleza, Ceará e Brasil',' — Notícias do Piauí, Brasil e mundo'],[' - Notícias e Análises`,description:"Cobertura completa"',' — Notícias do Piauí, Brasil e mundo`,description:'+JSON.stringify(description)],['Notícias, análises e serviço público com independência editorial e compromisso com a comunidade.',description]];
for(const [from,to] of replacements){if(worker.split(from).length!==2)throw Error(`Unexpected replacement count: ${from}`);worker=worker.replace(from,to)}
await writeFile(`${target}/site/_worker.js`,worker);
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'4d3a42f7-17e3-4f60-8c29-e251ab0e398c',baseManifest:manifest.digest,changes:replacements,workerSha256:createHash('sha256').update(worker).digest('hex')},null,2));
console.log('Verified base manifest; isolated SEO bundle prepared.');
