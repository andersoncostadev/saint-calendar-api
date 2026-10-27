// Gera src/Infrastructure.Data/Calendar/saints.json uma única vez.
// Uso: node tools/generate-calendar.mjs, depois node tools/enrich-life-veneration.mjs
// O pedido do dia, na API, não consulta nenhuma destas fontes.

import { readFileSync, writeFileSync } from 'node:fs'
import { USER_AGENT, chunk, getJson } from './wikimedia.mjs'

const OUTPUT = new URL('../src/Infrastructure.Data/Calendar/saints.json', import.meta.url)
const WRITTEN = new URL('./written-biographies.json', import.meta.url)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const SAINT_STATUS = ['Q43115', 'Q3464126', 'Q123110154', 'Q18344276']
const CATHOLIC_STATUS = new Set(['Q3464126', 'Q123110154', 'Q18344276'])
const GENERAL_ROMAN_CALENDAR = new Set(['Q13012667', 'Q98782022'])
const RETIRED_CALENDARS = new Set(['Q7883976', 'Q5532158', 'Q1142865', 'Q35032'])
const WESTERN_RELIGIONS = new Set(['Q9592', 'Q1841', 'Q7361618', 'Q597526', 'Q842798'])
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const CANDIDATES_PER_DAY = 5
const ABBREVIATIONS = new Set(['c', 'ca', 'cf', 'd', 'dr', 'fl', 'fr', 'm', 'n', 'pe', 's', 'sec', 'séc', 'sr', 'sra', 'st', 'sta', 'sto'])
const NON_LATIN = /[\u0250-\u02AF\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u10A0-\u10FF\u1200-\u137F\u2C80-\u2CFF]/

const WIKIPEDIA_SOURCE = {
  name: 'Wikipédia',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br',
}

const WIKIDATA_SOURCE = {
  name: 'Wikidata; biografia escrita para esta API',
  license: 'CC0 1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/deed.pt-br',
}

const QUERY = `
SELECT ?s ?st ?dayLabel ?sitelinks ?ptTitle
  (SAMPLE(?ptBrLabel) AS ?labelPtBr) (SAMPLE(?ptLabel) AS ?labelPt) (SAMPLE(?img) AS ?image)
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?status), "entity/")) AS ?statuses)
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?part), "entity/")) AS ?parts)
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?rel), "entity/")) AS ?religions)
  (COUNT(DISTINCT ?end) AS ?ends)
WHERE {
  ?s wdt:P31 wd:Q5 ; p:P841 ?st ; wikibase:sitelinks ?sitelinks .
  ?st ps:P841 ?day .
  FILTER(
    EXISTS { ?s wdt:P411 ?saintStatus . FILTER(?saintStatus IN (${SAINT_STATUS.map((id) => `wd:${id}`).join(', ')})) } ||
    EXISTS { ?st pq:P361 ?calendar . FILTER(?calendar IN (${[...GENERAL_ROMAN_CALENDAR].map((id) => `wd:${id}`).join(', ')})) }
  )
  OPTIONAL { ?s wdt:P411 ?status }
  ?day rdfs:label ?dayLabel . FILTER(LANG(?dayLabel) = "en")
  OPTIONAL { ?st pq:P361 ?part }
  OPTIONAL { ?st pq:P140 ?rel }
  OPTIONAL { ?st pq:P582 ?end }
  OPTIONAL { ?pt schema:about ?s ; schema:isPartOf <https://pt.wikipedia.org/> ; schema:name ?ptTitle }
  OPTIONAL { ?s rdfs:label ?ptBrLabel . FILTER(LANG(?ptBrLabel) = "pt-br") }
  OPTIONAL { ?s rdfs:label ?ptLabel . FILTER(LANG(?ptLabel) = "pt") }
  OPTIONAL { ?s wdt:P18 ?img }
} GROUP BY ?s ?st ?dayLabel ?sitelinks ?ptTitle
`

async function main() {
  const written = JSON.parse(readFileSync(WRITTEN, 'utf8'))
  const statements = (await sparql(QUERY)).map(readStatement).filter(Boolean)
  const candidates = byDay(eligible(statements))
  const files = [...candidates.values()]
    .flatMap((list) => list.filter((item) => item.ptTitle).sort(rank).slice(0, 6))
    .concat(statements.filter((item) => Object.values(written).some((manual) => manual.wikidata === item.id)))
    .map((item) => item.imageFile)
    .filter(Boolean)
  const images = await readImageLicenses([...new Set(files)])

  const ranked = new Map()
  for (const key of allDays()) {
    const list = (candidates.get(key) ?? [])
      .filter((item) => item.ptTitle)
      .map((item) => ({ ...item, photo: images.get(item.imageFile) ?? null }))
      .sort(rank)
      .slice(0, CANDIDATES_PER_DAY)
    ranked.set(key, list)
  }

  const sentences = await readFirstSentences([...ranked.values()].flat().map((item) => item.ptTitle))
  const options = new Map(
    [...ranked.entries()].map(([key, list]) => [key, list.filter((item) => sentences.has(item.ptTitle))]),
  )
  const picks = assignOnce(options)

  const days = []
  for (const key of allDays()) {
    const pick = picks.get(key)
    if (pick) {
      const { text, adapted } = sentences.get(pick.ptTitle)
      days.push(entry(key, pick, text, pick.photo, sourceFromWikipedia(pick.ptTitle, adapted)))
      continue
    }
    const manual = written[key]
    if (!manual) continue
    const item = statements.find((statement) => statement.id === manual.wikidata && statement.day === key)
    const photo = item ? images.get(item.imageFile) ?? null : null
    days.push(
      entry(key, { ...item, title: manual.title }, manual.biography, photo, {
        ...WIKIDATA_SOURCE,
        url: `https://www.wikidata.org/wiki/${manual.wikidata}`,
      }),
    )
  }

  const missing = allDays().filter((key) => !days.some((item) => item.day === key))
  const file = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: 'Wikidata (P841, CC0), Wikipédia em português (CC BY-SA 4.0), Wikimedia Commons (licença de cada arquivo)',
    days,
  }
  writeFileSync(OUTPUT, JSON.stringify(file, null, 2) + '\n', 'utf8')
  console.log(`dias: ${days.length}; com foto: ${days.filter((item) => item.image).length}; ausentes: ${missing.join(', ') || 'nenhum'}`)
}

function readStatement(row) {
  const parts = /^(\w+) (\d{1,2})$/.exec(row.dayLabel)
  if (!parts) return null
  const month = MONTHS.indexOf(parts[1]) + 1
  const date = Number(parts[2])
  if (month === 0 || date < 1 || date > DAYS_IN_MONTH[month - 1]) return null
  return {
    id: row.s.split('/').pop(),
    day: `${pad(month)}-${pad(date)}`,
    sitelinks: Number(row.sitelinks),
    ptTitle: row.ptTitle ?? null,
    title: titleOf(row),
    imageFile: row.image ? decodeURIComponent(row.image.split('/Special:FilePath/').pop()).replace(/_/g, ' ') : null,
    statuses: words(row.statuses),
    parts: words(row.parts),
    religions: words(row.religions),
    ended: Number(row.ends) > 0,
  }
}

function titleOf(row) {
  const label = (row.labelPtBr ?? row.labelPt ?? '').trim()
  const article = (row.ptTitle ?? '').replace(/\s*\([^)]*\)$/, '').trim()
  return article.length > label.length ? article : label
}

function assignOnce(options) {
  const index = new Map([...options.keys()].map((key) => [key, 0]))
  for (let pass = 0; pass < 50; pass += 1) {
    const owners = new Map()
    for (const [key, list] of options) {
      const item = list[index.get(key)]
      if (!item) continue
      if (!owners.has(item.id)) owners.set(item.id, [])
      owners.get(item.id).push(key)
    }
    let moved = false
    for (const keys of owners.values()) {
      if (keys.length < 2) continue
      const keep = [...keys].sort((a, b) => keepScore(options, index, b) - keepScore(options, index, a) || a.localeCompare(b))[0]
      for (const key of keys) {
        if (key === keep || index.get(key) + 1 >= options.get(key).length) continue
        index.set(key, index.get(key) + 1)
        moved = true
      }
    }
    if (!moved) break
  }
  return new Map([...options.entries()].map(([key, list]) => [key, list[index.get(key)]]).filter(([, item]) => item))
}

function keepScore(options, index, key) {
  const list = options.get(key)
  const item = list[index.get(key)]
  const alternatives = list.length - index.get(key) - 1
  return (isGeneralRoman(item) ? 1000 : 0) - alternatives
}

function eligible(statements) {
  const kept = statements.filter((item) => {
    if (item.ended) return false
    if (item.parts.some((id) => RETIRED_CALENDARS.has(id))) return false
    if (item.religions.length > 0 && !item.religions.some((id) => WESTERN_RELIGIONS.has(id))) return false
    return true
  })
  const roman = new Set(kept.filter(isGeneralRoman).map((item) => item.id))
  return kept.filter((item) => !roman.has(item.id) || isGeneralRoman(item))
}

function byDay(statements) {
  const map = new Map()
  for (const item of statements) {
    if (!map.has(item.day)) map.set(item.day, [])
    if (!map.get(item.day).some((other) => other.id === item.id)) map.get(item.day).push(item)
  }
  return map
}

function rank(a, b) {
  return (
    Number(isGeneralRoman(b)) - Number(isGeneralRoman(a)) ||
    Number(b.photo != null) - Number(a.photo != null) ||
    Number(isCatholic(b)) - Number(isCatholic(a)) ||
    b.sitelinks - a.sitelinks ||
    a.id.localeCompare(b.id)
  )
}

function isGeneralRoman(item) {
  return item.parts.some((id) => GENERAL_ROMAN_CALENDAR.has(id))
}

function isCatholic(item) {
  return item.statuses.some((id) => CATHOLIC_STATUS.has(id))
}

function entry(day, item, biography, photo, source) {
  const saint = { day, title: item.title, biography }
  if (photo) saint.image = photo.url
  saint.source = source
  if (photo) saint.imageCredit = { author: photo.author, license: photo.license, url: photo.page }
  return saint
}

function sourceFromWikipedia(title, adapted) {
  return {
    name: adapted ? `${WIKIPEDIA_SOURCE.name}, trecho adaptado` : WIKIPEDIA_SOURCE.name,
    url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    license: WIKIPEDIA_SOURCE.license,
    licenseUrl: WIKIPEDIA_SOURCE.licenseUrl,
  }
}

async function readImageLicenses(files) {
  const result = new Map()
  for (const batch of chunk(files.filter((file) => !/\.svg$/i.test(file)), 25)) {
    const url = new URL('https://commons.wikimedia.org/w/api.php')
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '800',
      titles: batch.map((file) => `File:${file}`).join('|'),
    })
    const body = await getJson(url)
    const normalized = new Map((body.query?.normalized ?? []).map((item) => [item.to, item.from]))
    for (const page of body.query?.pages ?? []) {
      const info = page.imageinfo?.[0]
      if (!info) continue
      const meta = info.extmetadata ?? {}
      const license = clean(meta.LicenseShortName?.value)
      if (!isReusable(license)) continue
      const imageUrl = (info.thumburl ?? info.url ?? '').split('?')[0]
      if (!isPortraitUrl(imageUrl)) continue
      const title = normalized.get(page.title) ?? page.title
      result.set(title.replace(/^File:/, ''), {
        url: imageUrl,
        license,
        author: clean(meta.Artist?.value) || 'Autor desconhecido',
        page: info.descriptionurl,
      })
    }
  }
  return result
}

function isReusable(license) {
  const name = license.toLowerCase()
  if (/\bnc\b|\bnd\b|non-?commercial|no ?deriv/.test(name)) return false
  return /public domain|^pd\b|^pd-|cc0|^cc[ -]by(-sa)?\b/.test(name)
}

function isPortraitUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false
  const path = new URL(value).pathname.toLowerCase()
  return IMAGE_EXTENSIONS.some((extension) => path.endsWith(extension))
}

async function readFirstSentences(titles) {
  const result = new Map()
  for (const batch of chunk([...new Set(titles)], 20)) {
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
      const sentence = sentenceOf(page.extract)
      if (sentence) result.set(back.get(page.title) ?? page.title, sentence)
    }
  }
  return result
}

function sentenceOf(extract) {
  if (typeof extract !== 'string') return null
  const paragraph = extract.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
  const original = firstSentence(tidy(paragraph))
  if (!original) return null
  const text = firstSentence(tidy(withoutLanguageNotes(paragraph)))
  if (!text) return null
  return { text, adapted: text !== original }
}

function firstSentence(text) {
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '(' || char === '[') depth += 1
    else if ((char === ')' || char === ']') && depth > 0) depth -= 1
    else if (depth === 0 && '.!?'.includes(char)) {
      const rest = text.slice(index + 1)
      if (rest !== '' && !/^\s+["“«(]?[A-ZÀ-Ý]/.test(rest)) continue
      const word = (/(\S+)$/.exec(text.slice(0, index))?.[1] ?? '').replace(/^\(/, '')
      if (/^[A-ZÀ-Ý]$/.test(word) || word.includes('.') || ABBREVIATIONS.has(word.toLowerCase())) continue
      return text.slice(0, index + 1).trim()
    }
  }
  return ''
}

function withoutLanguageNotes(text) {
  let current = text
  for (let pass = 0; pass < 5; pass += 1) {
    const next = current.replace(/\s*\(([^()]*)\)/g, (group, inner) => (isLanguageNote(inner) ? '' : group))
    if (next === current) break
    current = next
  }
  return current
}

function isLanguageNote(inner) {
  if (NON_LATIN.test(inner)) return true
  return /\bem [a-zà-ú ]+:|romaniz\.|^\s*(gueês|grego|latim|hebraico|árabe|siríaco|copta|armênio|georgiano)\b/i.test(inner)
}

function tidy(text) {
  return text
    .replace(/\(\s*[;,]?\s*\)/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

async function sparql(query) {
  const response = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query }),
  })
  if (!response.ok) throw new Error(`SPARQL ${response.status}`)
  const body = await response.json()
  return body.results.bindings.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value.value])))
}

function clean(html) {
  if (typeof html !== 'string') return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

function allDays() {
  return DAYS_IN_MONTH.flatMap((count, month) => Array.from({ length: count }, (_, date) => `${pad(month + 1)}-${pad(date + 1)}`))
}

function words(value) {
  return typeof value === 'string' && value.trim() ? value.trim().split(/\s+/) : []
}

function pad(value) {
  return String(value).padStart(2, '0')
}

await main()
