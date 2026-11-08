import {readFile,writeFile} from 'node:fs/promises'
import sharp from 'sharp'
const logo=await readFile('public/static/logo-dp.png')
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="#f7f9fa"/><image href="data:image/png;base64,${logo.toString('base64')}" x="180" y="180" width="840" height="840" preserveAspectRatio="xMidYMid meet"/></svg>`
await writeFile('public/static/article-placeholder-v1.svg',svg)
await sharp(Buffer.from(svg)).png().toFile('public/static/article-placeholder-v1.png')
console.log('Imagem alternativa: 1200 × 1200, logo inteira a 70% da largura, centralizada.')
