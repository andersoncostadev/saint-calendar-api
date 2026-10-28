// Gera src/Infrastructure.Data/Calendar/saints.json uma única vez.
// Uso: node tools/read-cancaonova-calendar.mjs, node tools/generate-calendar.mjs,
// node tools/enrich-summary.mjs e node tools/enrich-life-veneration.mjs, nesta ordem.
// O pedido do dia, na API, não consulta nenhuma destas fontes.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { authorOf, cancaoNovaTitle, collapsePunctuation, dayKeyFromLabel, FEAST_REQUIRED_TYPES, isMovableCelebration, licenseName, RELIGIOUS_TYPES, sexOf, wikidataTitle } from './calendar-rules.mjs'
import { firstSentence, tidy, withoutLanguageNotes } from './intro-text.mjs'
import { USER_AGENT, chunk, getJson, sleep } from './wikimedia.mjs'

const OUTPUT = new URL('../src/Infrastructure.Data/Calendar/saints.json', import.meta.url)
const WRITTEN = new URL('./written-biographies.json', import.meta.url)
const CANCAO_NOVA = new URL('./cancaonova-calendar.json', import.meta.url)
const CANCAO_NOVA_TITLES = new URL('./cancaonova-titles.json', import.meta.url)
const FEASTS_CACHE = new URL('./wikidata-feasts.json', import.meta.url)
const CANCAO_NOVA_NAME = 'Canção Nova, Santo do Dia'
const BLESSED = 'Q2369287'
const HUMAN = 'Q5'
const HONORIFICS = new Set(['são', 'santo', 'santa', 'beato', 'beata'])
const SAINT_PREFIX = /^(são|santo|santa|santos|santas|beato|beata|beatos|beatas)\s/i
const NAME_STOPWORDS = new Set(['sao', 'santo', 'santa', 'santos', 'santas', 'beato', 'beata', 'beatos', 'beatas', 'frei', 'padre', 'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'i', 'ii', 'iii'])
const NAME_CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del', 'della', 'von', 'van', 'la', 'le', 'y'])
const TITLE_PREFIX = /^(são|santo|santa|santos|santas|beato|beata|beatos|beatas|frei|padre)\s+/i

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const SAINT_STATUS = ['Q43115', 'Q3464126', 'Q123110154', 'Q18344276']
const CATHOLIC_STATUS = new Set(['Q3464126', 'Q123110154', 'Q18344276'])
const GENERAL_ROMAN_CALENDAR = new Set(['Q13012667', 'Q98782022'])
const RETIRED_CALENDARS = new Set(['Q7883976', 'Q5532158', 'Q1142865', 'Q35032'])
const WESTERN_RELIGIONS = new Set(['Q9592', 'Q1841', 'Q7361618', 'Q597526', 'Q842798'])
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const CANDIDATES_PER_DAY = 5

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
  const cancaoDays = readJson(CANCAO_NOVA)?.days ?? {}
  const statements = (await feastRows()).map(readStatement).filter(Boolean)
  const feasts = new Set(statements.map((item) => `${item.id}|${item.day}`))
  const known = new Set(statements.map((item) => item.id))
  const manualTitles = readJson(CANCAO_NOVA_TITLES) ?? {}
  const writtenOnly = new Set(Object.keys(written).filter((day) => !manualTitles[day]))
  const cancaoNova = await resolveCancaoNova(cancaoDays, manualTitles, feasts, known, new Set(Object.keys(written)))
  const writtenEntities = await readEntities(Object.values(written).map((item) => item.wikidata).filter(Boolean))
  const reserved = new Set([
    ...[...cancaoNova.values()].map((item) => item.id),
    ...Object.values(written).map((item) => item.wikidata).filter(Boolean),
  ])
  const candidates = byDay(eligible(statements).filter((item) => isRecognized(item) && !reserved.has(item.id)))
  const files = [...candidates.values()]
    .flatMap((list) => list.filter((item) => item.ptTitle).sort(rank).slice(0, 6))
    .concat(statements.filter((item) => Object.values(written).some((manual) => manual.wikidata === item.id)))
    .concat([...cancaoNova.values()])
    .map((item) => item.imageFile)
    .concat([...writtenEntities.values()].map(imageFileOf))
    .concat(Object.values(written).map((item) => item.image))
    .filter(Boolean)
  const images = await readImageLicenses([...new Set(files)])

  const ranked = new Map()
  for (const key of allDays()) {
    if (writtenOnly.has(key)) {
      ranked.set(key, [])
      continue
    }
    const fallback = (candidates.get(key) ?? [])
      .filter((item) => item.ptTitle)
      .map((item) => ({ ...item, photo: images.get(item.imageFile) ?? null }))
      .sort(rank)
      .slice(0, CANDIDATES_PER_DAY)
    const chosen = cancaoNova.get(key)
    ranked.set(key, chosen ? [{ ...chosen, photo: images.get(chosen.imageFile) ?? null }, ...fallback] : fallback)
  }

  const sentences = await readFirstSentences([...ranked.values()].flat().map((item) => item.ptTitle))
  const options = new Map(
    [...ranked.entries()].map(([key, list]) => [key, list.filter((item) => sentences.has(item.ptTitle))]),
  )
  const picks = assignOnce(options)
  await honorificForWikidata([...picks.values()].filter((item) => !item.calendar))

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
    const entity = manual.wikidata ? writtenEntities.get(manual.wikidata) : null
    const imageFile = manual.image ?? imageFileOf(entity)
    const photo = imageFile ? images.get(imageFile) ?? null : null
    const calendar = fixedCalendar(key, cancaoDays)
    days.push(entry(key, { title: manual.title, calendar }, collapsePunctuation(manual.biography), photo, writtenSource(manual, calendar)))
  }

  const missing = allDays().filter((key) => !days.some((item) => item.day === key))
  const file = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: 'Canção Nova, Santo do Dia (só qual santo cada dia celebra), Wikidata (P841 e P411, CC0), Wikipédia em português (CC BY-SA 4.0), Wikimedia Commons (licença de cada arquivo)',
    days,
  }
  writeFileSync(OUTPUT, JSON.stringify(file, null, 2) + '\n', 'utf8')
  const fromCancaoNova = days.filter((item) => item.calendar).length
  console.log(`dias: ${days.length}; da Canção Nova: ${fromCancaoNova}; com foto: ${days.filter((item) => item.image).length}; ausentes: ${missing.join(', ') || 'nenhum'}`)
  for (const item of days.filter((saint) => !saint.calendar)) console.log(`  sem Canção Nova: ${item.day} ${item.title}`)
}

async function resolveCancaoNova(days, titles, feasts, known, writtenDays) {
  const wanted = Object.entries(days).flatMap(([day, list]) =>
    list.map((item, order) => {
      const full = coreName(item.name)
      return { day, order, ...item, full, core: firstPerson(full) }
    }),
  ).filter((item) => !isMovableCelebration(item.name) && !(writtenDays.has(item.day) && !titles[item.day]))
  const manualOf = (day) => (typeof titles[day] === 'string' ? { article: titles[day] } : titles[day])
  const lookups = new Map()
  for (const item of wanted) {
    const manual = manualOf(item.day)?.article
    const names = manual ? [manual] : [...new Set([item.core, withoutHonorific(item.core)])]
    lookups.set(item, names)
  }

  const direct = await resolveTitles([...new Set([...lookups.values()].flat())])
  for (const item of wanted) {
    if (titles[item.day]) continue
    const found = lookups.get(item).map((name) => direct.get(name)).filter(Boolean)
    if (found.length > 0) continue
    const byName = await searchTitles(withoutHonorific(item.core))
    const byTitle = await searchTitles(item.name.replace(/["“”:]/g, ' '))
    lookups.set(item, [...new Set([...byName, ...byTitle])])
  }

  const pages = await resolveTitles([...new Set([...lookups.values()].flat())])
  const ids = [...new Set([...pages.values()].map((page) => page.id))]
  const entities = await readEntities(ids)
  const dayLabels = await readDayLabels(feastItemIds(entities))

  const result = new Map()
  const unresolved = []
  for (const item of wanted.sort((a, b) => a.day.localeCompare(b.day) || a.order - b.order)) {
    if (result.has(item.day)) continue
    const manual = Boolean(titles[item.day])
    const options = lookups
      .get(item)
      .map((name) => pages.get(name))
      .filter(Boolean)
      .sort((a, b) => Number(feasts.has(`${b.id}|${item.day}`)) - Number(feasts.has(`${a.id}|${item.day}`)))
    const page = options.find((option) => manual || accepts(item, option, entities.get(option.id), known, dayLabels))
    if (!page) {
      unresolved.push(item)
      continue
    }
    const entity = entities.get(page.id)
    const picked = pickFromCancaoNova(item, page, entity, manualOf(item.day)?.title)
    result.set(item.day, picked)
    const types = claimItems(entity?.claims ?? {}, 'P31')
    if (!types.includes(HUMAN)) console.log(`  aceito sem ser pessoa: ${item.day} ${page.title}`)
    else if (!feasts.has(`${page.id}|${item.day}`)) console.log(`  pessoa sem festa no dia: ${item.day} ${page.title}`)
  }
  for (const item of unresolved.filter((entry) => !result.has(entry.day))) console.log(`  Canção Nova sem artigo aceito: ${item.day} ${item.name}`)
  return result
}

function pickFromCancaoNova(item, page, entity, manualTitle) {
  const claims = entity?.claims ?? {}
  const human = claimItems(claims, 'P31').includes(HUMAN)
  const title = manualTitle ?? (human ? cancaoNovaTitle(titleHead(item.name), sexOf(claimItems(claims, 'P21'))) : titleHead(item.name))
  return {
    id: page.id,
    day: item.day,
    ptTitle: page.title,
    title,
    imageFile: imageFileOf(entity),
    statuses: claimItems(claims, 'P411'),
    parts: [],
    religions: [],
    sitelinks: 0,
    calendar: { name: CANCAO_NOVA_NAME, url: item.url },
  }
}

function accepts(item, page, entity, known, dayLabels) {
  if (!entity) return false
  const claims = entity.claims ?? {}
  const names = [page.title, entity.labels?.['pt-br']?.value, entity.labels?.pt?.value, ...(entity.aliases?.pt ?? []).map((alias) => alias.value)]
    .filter(Boolean)
    .map(tokens)
  const wanted = tokens(item.core)
  if (wanted.length === 0) return false
  const needed = Math.max(1, Math.ceil(wanted.length * 0.6))
  const matches = names.some((name) => name.includes(wanted[0]) && wanted.filter((token) => name.includes(token)).length >= needed)
  if (!matches) return false
  const types = claimItems(claims, 'P31')
  if (types.includes(HUMAN)) return known.has(page.id) || claimItems(claims, 'P411').some((id) => SAINT_STATUS.includes(id) || id === BLESSED)
  if (!types.some((id) => RELIGIOUS_TYPES.has(id))) return false
  if (types.some((id) => FEAST_REQUIRED_TYPES.has(id)) && !feastDays(entity, dayLabels).includes(item.day)) return false
  return true
}

function titleHead(name) {
  const head = name.replace(/["“”]/g, '').split(/\s*(?:,|:|\s[–—-]\s|\(|\[)\s*/)[0].trim()
  const words = head.split(/\s+/)
  const cut = words.findIndex((word, index) => index > 0 && /^[\p{Ll}0-9]/u.test(word) && !NAME_CONNECTORS.has(word.toLowerCase()))
  return (cut === -1 ? words : words.slice(0, cut)).join(' ').replace(/\s+(?:e|de|da|do|das|dos)$/i, '')
}

function imageFileOf(entity) {
  const value = entity?.claims?.P18?.find((statement) => statement.rank !== 'deprecated' && statement.mainsnak?.snaktype === 'value')?.mainsnak.datavalue.value
  return typeof value === 'string' ? value : null
}

function feastItemIds(entities) {
  const ids = []
  for (const entity of entities.values()) {
    for (const statement of entity?.claims?.P841 ?? []) {
      const id = statement.mainsnak?.datavalue?.value?.id
      if (id) ids.push(id)
    }
  }
  return [...new Set(ids)]
}

function feastDays(entity, dayLabels) {
  const days = []
  for (const statement of entity?.claims?.P841 ?? []) {
    if (statement.rank === 'deprecated' || statement.mainsnak?.snaktype !== 'value') continue
    const value = statement.mainsnak.datavalue.value
    if (typeof value?.time === 'string' && value.precision >= 11) {
      const match = /^[+-]\d+-(\d\d)-(\d\d)/.exec(value.time)
      if (match) days.push(`${match[1]}-${match[2]}`)
    } else if (value?.id && dayLabels.get(value.id)) days.push(dayLabels.get(value.id))
  }
  return days
}

async function readDayLabels(ids) {
  const result = new Map()
  for (const batch of chunk(ids, 50)) {
    const url = new URL('https://www.wikidata.org/w/api.php')
    url.search = new URLSearchParams({ action: 'wbgetentities', format: 'json', props: 'labels', languages: 'pt|en', ids: batch.join('|') })
    const body = await getJson(url)
    for (const [id, entity] of Object.entries(body.entities ?? {})) {
      const label = entity.labels?.pt?.value ?? entity.labels?.en?.value ?? ''
      const key = dayKeyFromLabel(label)
      if (key) result.set(id, key)
    }
  }
  return result
}

async function honorificForWikidata(items) {
  const entities = await readEntities(items.map((item) => item.id))
  for (const item of items) {
    const claims = entities.get(item.id)?.claims ?? {}
    item.title = wikidataTitle(item.title, {
      saint: item.statuses.some((id) => SAINT_STATUS.includes(id)),
      blessed: item.statuses.includes(BLESSED),
      sex: sexOf(claimItems(claims, 'P21')),
    })
  }
}

function fixedCalendar(day, days) {
  const entry = (days[day] ?? []).find((item) => !isMovableCelebration(item.name))
  return entry ? { name: CANCAO_NOVA_NAME, url: entry.url } : undefined
}

function writtenSource(manual) {
  if (!manual.wikidata) return null
  return {
    ...WIKIDATA_SOURCE,
    url: `https://www.wikidata.org/wiki/${manual.wikidata}`,
  }
}

async function resolveTitles(titles) {
  const result = new Map()
  for (const batch of chunk(titles, 50)) {
    const url = new URL('https://pt.wikipedia.org/w/api.php')
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'pageprops',
      ppprop: 'wikibase_item|disambiguation',
      redirects: '1',
      titles: batch.join('|'),
    })
    const body = await getJson(url)
    const back = new Map()
    for (const item of body.query?.normalized ?? []) back.set(item.to, item.from)
    for (const item of body.query?.redirects ?? []) back.set(item.to, back.get(item.from) ?? item.from)
    for (const page of body.query?.pages ?? []) {
      const id = page.pageprops?.wikibase_item
      if (!id || page.missing || page.pageprops?.disambiguation !== undefined) continue
      const value = { title: page.title, id }
      result.set(page.title, value)
      let name = page.title
      while (back.has(name)) {
        name = back.get(name)
        result.set(name, value)
      }
    }
  }
  return result
}

async function searchTitles(query) {
  const url = new URL('https://pt.wikipedia.org/w/api.php')
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', list: 'search', srsearch: query, srlimit: '5', srnamespace: '0' })
  const body = await getJson(url)
  return (body.query?.search ?? []).map((item) => item.title)
}

async function readEntities(ids) {
  const result = new Map()
  for (const batch of chunk(ids, 50)) {
    const url = new URL('https://www.wikidata.org/w/api.php')
    url.search = new URLSearchParams({ action: 'wbgetentities', format: 'json', props: 'claims|labels|aliases', languages: 'pt-br|pt', ids: batch.join('|') })
    const body = await getJson(url)
    for (const [id, entity] of Object.entries(body.entities ?? {})) result.set(id, entity)
  }
  return result
}

function claimItems(claims, property) {
  return (claims[property] ?? [])
    .filter((statement) => statement.rank !== 'deprecated' && statement.mainsnak?.snaktype === 'value')
    .map((statement) => statement.mainsnak.datavalue.value.id)
    .filter(Boolean)
}

function coreName(name) {
  const head = name.replace(/["“”]/g, '').split(/\s*(?:,|:|\s[–—-]\s|\(|\[)\s*/)[0].trim()
  const words = head.split(/\s+/)
  const end = words.findIndex((word, index) => index > 0 && /^[a-zà-ú]/.test(word) && !NAME_CONNECTORS.has(word))
  return (end === -1 ? words : words.slice(0, end)).join(' ').replace(/\s+(?:e|de|da|do|das|dos)$/i, '')
}

function firstPerson(name) {
  if (!SAINT_PREFIX.test(name)) return name
  const [first] = name.split(/\s+e\s+/)
  return first.replace(/^Santos\s/i, 'São ').replace(/^Santas\s/i, 'Santa ').replace(/^Beatos\s/i, 'Beato ').replace(/^Beatas\s/i, 'Beata ')
}

function withoutHonorific(name) {
  const stripped = name.replace(TITLE_PREFIX, '')
  return stripped || name
}

function tokens(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !NAME_STOPWORDS.has(word))
}

function readJson(url) {
  return existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : null
}

function isRecognized(item) {
  return isCatholic(item) || isGeneralRoman(item)
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
  return (item.calendar ? 10000 : 0) + (isGeneralRoman(item) ? 1000 : 0) - alternatives
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
  if (source) saint.source = source
  if (photo) saint.imageCredit = { author: photo.author, license: photo.license, url: photo.page }
  if (item.calendar) saint.calendar = item.calendar
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
      const rawLicense = clean(meta.LicenseShortName?.value)
      if (!isReusable(rawLicense)) continue
      const license = licenseName(rawLicense)
      const imageUrl = (info.thumburl ?? info.url ?? '').split('?')[0]
      if (!isPortraitUrl(imageUrl)) continue
      const title = normalized.get(page.title) ?? page.title
      result.set(title.replace(/^File:/, ''), {
        url: imageUrl,
        license,
        author: authorOf(meta.Artist?.value),
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
  const text = collapsePunctuation(firstSentence(tidy(withoutLanguageNotes(paragraph))))
  if (!text) return null
  return { text, adapted: text !== original }
}

async function feastRows() {
  try {
    const rows = await sparql(QUERY)
    writeFileSync(FEASTS_CACHE, JSON.stringify({ readAt: new Date().toISOString(), rows }) + '\n', 'utf8')
    return rows
  } catch (error) {
    const cached = readJson(FEASTS_CACHE)
    if (!cached) throw error
    console.log(`Wikidata indisponível (${error.message}); usando a consulta de ${cached.readAt}`)
    return cached.rows
  }
}

async function sparql(query) {
  let response
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    response = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(45000),
    })
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) break
    await sleep(attempt * 30000)
  }
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
