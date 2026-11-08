import {readFile,writeFile} from 'node:fs/promises'
import sharp from 'sharp'
const logo=(await readFile('public/static/logo-dp.png')).toString('base64')
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#f6f5f0"/>
<rect x="836" width="364" height="630" fill="#165a40"/>
<circle cx="1032" cy="290" r="220" fill="none" stroke="#327254"/>
<circle cx="1032" cy="290" r="170" fill="none" stroke="#327254"/>
<image href="data:image/png;base64,${logo}" x="64" y="45" width="196" height="72" preserveAspectRatio="xMinYMid meet"/>
<text x="65" y="167" font-family="Arial" font-size="15" font-weight="700" fill="#165a40" letter-spacing="2.3">NOSSO CANAL NO WHATSAPP</text>
<text x="60" y="251" font-family="Arial" font-size="67" font-weight="800" fill="#142b24" letter-spacing="-3">Notícias por perto.</text>
<text x="60" y="329" font-family="Georgia" font-style="italic" font-size="64" fill="#165a40" letter-spacing="-2">Seu número protegido.</text>
<text x="65" y="388" font-family="Arial" font-size="23" fill="#53665b">Outros seguidores não veem seu telefone.</text>
<text x="65" y="425" font-family="Arial" font-size="23" fill="#53665b">Informação do Piauí, do Brasil e do mundo.</text>
<rect x="64" y="473" width="266" height="62" rx="8" fill="#165a40"/>
<text x="90" y="513" font-family="Arial" font-size="23" font-weight="700" fill="#fff">Siga o canal</text>
<path d="M284 493h17v17m-18 1 18-18" stroke="#d9ef99" fill="none" stroke-width="2.5"/>
<text x="65" y="582" font-family="Arial" font-size="16" fill="#53665b">DIARIO.DOPOVO.COM.BR/WHATSAPP</text>
<rect x="895" y="165" width="228" height="295" rx="25" fill="#f6f5f0" transform="rotate(6 1009 312)"/>
<g transform="translate(925 225)"><path d="M82 0 150 25v68c0 53-38 82-68 96C52 175 14 146 14 93V25Z" fill="#d9ef99"/><path d="m51 88 23 23 42-48" fill="none" stroke="#165a40" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></g>
<text x="1014" y="502" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#d9ef99">Mais informação.</text>
<text x="1014" y="535" text-anchor="middle" font-family="Arial" font-size="20" fill="#fff">Mais privacidade.</text>
</svg>`
await writeFile('public/static/whatsapp-channel-og-v1.svg',svg)
await sharp(Buffer.from(svg)).jpeg({quality:90,mozjpeg:true}).toFile('public/static/whatsapp-channel-og-v1.jpg')
console.log(JSON.stringify(await sharp('public/static/whatsapp-channel-og-v1.jpg').metadata()))
