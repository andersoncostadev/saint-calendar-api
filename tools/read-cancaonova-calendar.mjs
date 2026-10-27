// Lê de santo.cancaonova.com só qual santo a Canção Nova celebra em cada dia.
// Guarda o dia, o nome e a URL da página; nenhum texto, oração ou foto da Canção Nova.
// Uso: node tools/read-cancaonova-calendar.mjs, antes de generate-calendar.mjs.

import { writeFileSync } from 'node:fs'
import { USER_AGENT, sleep } from './wikimedia.mjs'

const SITEMAP = 'https://santo.cancaonova.com/santo-sitemap.xml'
const OUTPUT = new URL('./cancaonova-calendar.json', import.meta.url)
const PAUSE_MS = 1000
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

async function main() {
  const urls = [...(await text(SITEMAP)).matchAll(/<loc>([^<]+\/santo\/[^<]+)<\/loc>/g)].map((match) => match[1])
  const days = {}
  const failed = []
  for (const url of urls) {
    await sleep(PAUSE_MS)
    const page = await text(url).catch(() => null)
    const entry = page ? readPage(page) : null
    if (!entry) {
      failed.push(url)
      continue
    }
    days[entry.day] ??= []
    if (!days[entry.day].some((item) => item.name === entry.name)) days[entry.day].push({ name: entry.name, url })
  }
  const sorted = Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(
    OUTPUT,
    JSON.stringify({ readAt: new Date().toISOString().slice(0, 10), source: 'https://santo.cancaonova.com', days: sorted }, null, 2) + '\n',
    'utf8',
  )
  console.log(`páginas: ${urls.length}; dias: ${Object.keys(sorted).length}; sem data ou nome: ${failed.length}`)
  for (const url of failed) console.log(`  ${url}`)
}

function readPage(html) {
  if (!/single-santo/.test(html)) return null
  const strip = html.indexOf('vertical-strip')
  const near = strip < 0 ? '' : html.slice(strip, strip + 400).replace(/^[^>]*>/, '').replace(/<[^>]+>/g, ' ')
  const date = /^\s*(\d{1,2})\s+([a-zç]{3})/i.exec(near)
  const title = /<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  if (!date || !title) return null
  const month = MONTHS.indexOf(date[2].toLowerCase()) + 1
  if (month === 0) return null
  const name = decode(title[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
  if (!name) return null
  return { day: `${String(month).padStart(2, '0')}-${date[1].padStart(2, '0')}`, name }
}

function decode(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
}

async function text(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}`)
  return response.text()
}

await main()
