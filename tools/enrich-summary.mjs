// Acrescenta a introdução do artigo (summary) a cada dia de saints.json.
// Fonte: o mesmo artigo da Wikipédia em português que dá a biografia (CC BY-SA 4.0).
// Uso: node tools/enrich-summary.mjs, depois de generate-calendar.mjs.
// Pode rodar de novo: troca o summary antigo pelo novo e mantém o resto do dia.

import { readFileSync, writeFileSync } from 'node:fs'
import { sentencesOf, tidy, withoutLanguageNotes } from './intro-text.mjs'
import { chunk, getJson } from './wikimedia.mjs'

const CALENDAR = new URL('../src/Infrastructure.Data/Calendar/saints.json', import.meta.url)
const WRITTEN = new URL('./written-biographies.json', import.meta.url)
const MAX_PARAGRAPHS = 3
const MAX_CHARACTERS = 1200
const ADAPTED_SOURCE = 'Wikipédia, trecho adaptado'
const LEFTOVER = /[{}[\]|=<>]|''|https?:/
const GLUED = /[a-zà-ÿ]{2}[A-ZÀ-Ý]|[a-zà-ÿ]{2}[.;:!?,][A-Za-zÀ-ÿ]{2}/

async function main() {
  const file = JSON.parse(readFileSync(CALENDAR, 'utf8'))
  const written = new Set(Object.keys(JSON.parse(readFileSync(WRITTEN, 'utf8'))))
  const titles = new Map()
  for (const saint of file.days) {
    const article = /pt\.wikipedia\.org\/wiki\/(.+)$/.exec(saint.source?.url ?? '')
    if (article && !written.has(saint.day)) titles.set(saint.day, decodeURIComponent(article[1]).replace(/_/g, ' '))
  }
  const extracts = await readExtracts([...new Set(titles.values())])

  const skipped = []
  let adaptedCount = 0
  file.days = file.days.map((saint) => {
    const { summary: _old, ...rest } = saint
    const title = titles.get(saint.day)
    if (!title) return rest
    const result = summaryOf(extracts.get(title), saint.biography)
    if (!result) {
      skipped.push(`${saint.day} ${saint.title}`)
      return rest
    }
    if (result.adapted && rest.source?.name === 'Wikipédia') {
      rest.source = { ...rest.source, name: ADAPTED_SOURCE }
      adaptedCount += 1
    }
    return ordered(rest, result.paragraphs)
  })

  writeFileSync(CALENDAR, JSON.stringify(file, null, 2) + '\n', 'utf8')
  const withSummary = file.days.filter((saint) => saint.summary)
  const paragraphs = [1, 2, 3].map((count) => withSummary.filter((saint) => saint.summary.length === count).length)
  console.log(`dias: ${file.days.length}; com artigo: ${titles.size}; com summary: ${withSummary.length} (1, 2 e 3 parágrafos: ${paragraphs.join(', ')}); fonte passou a trecho adaptado: ${adaptedCount}`)
  for (const item of skipped) console.log(`  sem summary: ${item}`)
}

function ordered(saint, summary) {
  const { day, title, biography, ...rest } = saint
  return { day, title, biography, summary, ...rest }
}

async function readExtracts(titles) {
  const result = new Map()
  for (const batch of chunk(titles, 20)) {
    const url = new URL('https://pt.wikipedia.org/w/api.php')
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'extracts',
      exintro: '1',
      explaintext: '1',
      exlimit: '20',
      redirects: '1',
      titles: batch.join('|'),
    })
    const body = await getJson(url)
    const back = new Map()
    for (const item of body.query?.normalized ?? []) back.set(item.to, item.from)
    for (const item of body.query?.redirects ?? []) back.set(item.to, back.get(item.from) ?? item.from)
    for (const page of body.query?.pages ?? []) {
      if (typeof page.extract !== 'string') continue
      let name = page.title
      result.set(name, page.extract)
      while (back.has(name)) {
        name = back.get(name)
        result.set(name, page.extract)
      }
    }
  }
  return result
}

function summaryOf(extract, biography) {
  if (typeof extract !== 'string' || !biography) return null
  const paragraphs = []
  let total = 0
  let adapted = false
  for (const raw of extract.split('\n').map((line) => line.trim()).filter(Boolean)) {
    if (paragraphs.length === MAX_PARAGRAPHS) break
    const first = paragraphs.length === 0
    const text = tidy(withoutLanguageNotes(raw))
    if (first && !(text === biography || text.startsWith(`${biography} `))) return null
    if (!isClean(text)) {
      if (first) return null
      break
    }
    const sentences = sentencesOf(text)
    if (sentences.length === 0) continue
    let kept = ''
    let cut = false
    for (const sentence of sentences) {
      const next = kept ? `${kept} ${sentence}` : sentence
      if (total + next.length > MAX_CHARACTERS) {
        cut = true
        break
      }
      kept = next
    }
    if (kept) {
      paragraphs.push(kept)
      total += kept.length
      if (text !== tidy(raw)) adapted = true
    }
    if (cut) break
  }
  return paragraphs.length > 0 ? { paragraphs, adapted } : null
}

function isClean(text) {
  return !LEFTOVER.test(text) && !GLUED.test(text)
}

await main()
