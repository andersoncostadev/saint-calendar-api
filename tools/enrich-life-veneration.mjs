// Acrescenta vida e veneração a cada dia de saints.json.
// Vida: Wikidata (CC0). Veneração: infobox do artigo da Wikipédia em português (CC BY-SA 4.0),
// com a Wikidata no lugar do que a infobox não tiver, exceto o padroado. Quem canonizou vem só da Wikidata.
// Uso: node tools/enrich-life-veneration.mjs, depois de generate-calendar.mjs e enrich-summary.mjs.
// Pode rodar de novo: troca os blocos antigos pelos novos e mantém o resto do dia.

import { readFileSync, writeFileSync } from 'node:fs'
import { chunk, getJson } from './wikimedia.mjs'

const CALENDAR = new URL('../src/Infrastructure.Data/Calendar/saints.json', import.meta.url)

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const SAINT_STATUS = new Set(['Q43115', 'Q3464126', 'Q123110154', 'Q18344276'])
const CATHOLIC_STATUS = new Set(['Q3464126', 'Q123110154', 'Q18344276'])
const PRE_CONGREGATION = 'Q18344276'
const BLESSED = 'Q2369287'
const GENERAL_ROMAN_CALENDAR = new Set(['Q13012667', 'Q98782022'])
const CATHOLIC_RELIGIONS = new Set(['Q9592', 'Q1841', 'Q7361618', 'Q597526', 'Q842798'])
const CIRCA = 'Q5727902'
const CHRISTIAN_CHURCH = /igreja|comunhão|cristandade|cristianismo|catolicismo|católic|ortodox|anglican|luteran|copta|maronit|armêni/i
const FIRST_CANONIZATION_YEAR = 993
const MAX_FIELD_LENGTH = 160
const ENGLISH_LABEL = /\b(of|the|and|church|order|abbey|cathedral|cemetery|chapel|monastery)\b/i
const ITEM_ID = /^Q\d+$/
const INFOBOX_FIELDS = [
  'venerado_em',
  'veneração',
  'data_beatificação',
  'beatificação',
  'data_canonização',
  'canonização',
  'patrono',
  'padroeiro',
  'atribuições',
  'atributos',
]

const WIKIDATA_FACTS = {
  name: 'Wikidata',
  license: 'CC0 1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/deed.pt-br',
}

async function main() {
  const file = JSON.parse(readFileSync(CALENDAR, 'utf8'))
  const { ids, titles } = await readWikidataIds(file.days)
  const entities = await readEntities([...new Set(ids.values())])
  const labels = await readLabels([...new Set([...entities.values()].flatMap(referencedItems))])
  const infoboxes = await readInfoboxes([...new Set(titles.values())])

  let withLife = 0
  let withVeneration = 0
  file.days = file.days.map((saint) => {
    const id = ids.get(saint.day)
    const claims = id ? entities.get(id) : null
    const infobox = infoboxes.get(titles.get(saint.day)) ?? {}
    const life = claims ? lifeOf(claims, labels) : null
    const veneration = venerationOf(claims ?? {}, labels, infobox, saint.day)
    if (life) withLife += 1
    if (Object.keys(veneration).length > 1) withVeneration += 1
    const factsSource = id && !saint.source?.url?.includes('wikidata.org') ? { ...WIKIDATA_FACTS, url: `https://www.wikidata.org/wiki/${id}` } : null
    return ordered(saint, life, veneration, factsSource)
  })

  writeFileSync(CALENDAR, JSON.stringify(file, null, 2) + '\n', 'utf8')
  console.log(`dias: ${file.days.length}; com item na Wikidata: ${ids.size}; com vida: ${withLife}; com veneração além da festa: ${withVeneration}`)
  const count = (block, field) => file.days.filter((saint) => saint[block]?.[field]).length
  const fields = [['life', 'burial'], ['life', 'order'], ['veneration', 'beatification'], ['veneration', 'canonizedBy'], ['veneration', 'attributes']]
  console.log(fields.map(([block, field]) => `${field}: ${count(block, field)}`).join('; '))
  if (droppedLabels.size > 0) console.log(`rótulos da Wikidata descartados: ${[...droppedLabels].join(' | ')}`)
}

function ordered(saint, life, veneration, factsSource) {
  const { day, title, biography, summary, image, source, imageCredit, calendar } = saint
  const result = { day, title, biography }
  if (summary) result.summary = summary
  if (image) result.image = image
  if (source) result.source = source
  if (imageCredit) result.imageCredit = imageCredit
  if (calendar) result.calendar = calendar
  if (life) result.life = life
  result.veneration = veneration
  if (factsSource) result.factsSource = factsSource
  return result
}

async function readWikidataIds(days) {
  const result = new Map()
  const titles = new Map()
  const byTitle = new Map()
  for (const saint of days) {
    const url = saint.source?.url ?? ''
    const direct = /wikidata\.org\/wiki\/(Q\d+)$/.exec(url)
    if (direct) {
      result.set(saint.day, direct[1])
      continue
    }
    const article = /pt\.wikipedia\.org\/wiki\/(.+)$/.exec(url)
    if (article) byTitle.set(decodeURIComponent(article[1]).replace(/_/g, ' '), saint.day)
  }

  for (const batch of chunk([...byTitle.keys()], 50)) {
    const url = new URL('https://pt.wikipedia.org/w/api.php')
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'pageprops',
      ppprop: 'wikibase_item',
      redirects: '1',
      titles: batch.join('|'),
    })
    const body = await getJson(url)
    const back = new Map()
    for (const item of body.query?.normalized ?? []) back.set(item.to, item.from)
    for (const item of body.query?.redirects ?? []) back.set(item.to, back.get(item.from) ?? item.from)
    for (const page of body.query?.pages ?? []) {
      const day = byTitle.get(back.get(page.title) ?? page.title)
      if (!day || page.missing) continue
      titles.set(day, page.title)
      const id = page.pageprops?.wikibase_item
      if (id) result.set(day, id)
    }
  }
  return { ids: result, titles }
}

async function readInfoboxes(titles) {
  const result = new Map()
  for (const batch of chunk(titles, 50)) {
    const url = new URL('https://pt.wikipedia.org/w/api.php')
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: batch.join('|'),
    })
    const body = await getJson(url)
    for (const page of body.query?.pages ?? []) {
      const content = page.revisions?.[0]?.slots?.main?.content
      if (content) result.set(page.title, infoboxOf(content))
    }
  }
  return result
}

function infoboxOf(content) {
  const fields = {}
  const lines = content.split(/\n(?:'''|==)/)[0].split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*\|\s*([\wçãõáéíóúâêô_]+)\s*=(.*)$/i.exec(lines[index])
    if (!match) continue
    const name = match[1].toLowerCase()
    if (!INFOBOX_FIELDS.includes(name)) continue
    let value = match[2]
    for (let next = index + 1; next < lines.length && !/^\s*(\||\}\})/.test(lines[next]); next += 1) value += `\n${lines[next]}`
    const text = name.startsWith('atrib')
      ? wikiText(value.replace(/\s*•\s*/g, '\n'), ', ', false)
      : wikiText(value, name.startsWith('venera') ? ', ' : '; ')
    if (text && !fields[name]) fields[name] = text
  }
  const patronOf = fields.patrono ?? fields.padroeiro ?? null
  const attributes = fields['atribuições'] ?? fields.atributos ?? null
  return {
    veneratedBy: (fields.venerado_em ?? fields['veneração'])?.replace(/;\s*/g, ', ') ?? null,
    beatification: fields['data_beatificação'] ?? fields['beatificação'] ?? null,
    canonization: fields['data_canonização'] ?? fields['canonização'] ?? null,
    patronOf: patronOf ? capitalize(patronOf) : null,
    attributes: attributes ? capitalize(attributes.replace(/;\s*/g, ', ')) : null,
  }
}

function wikiText(value, separator, splitAdjacentLinks = true) {
  let text = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\{\s*dtlink\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})\s*\|\s*(-?\d{1,4})\s*\}\}/gi, (_, day, month, year) => dayMonthYear(Number(day), Number(month), Number(year)))
    .replace(/\{\{\s*(?:nowrap|lang\|\w+)\s*\|([^{}]*)\}\}/gi, '$1')
    .replace(/\]\]\s*\[\[/g, splitAdjacentLinks ? ']]' + separator + '[[' : ']] [[')
    .replace(/<\/?br\s*\/?>/gi, separator)
  for (let pass = 0; pass < 5; pass += 1) text = text.replace(/\{\{[^{}]*\}\}/g, '')
  text = text
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:[^\]]*\]/g, '')
    .replace(/https?:\S+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\s*\n\s*\*?\s*/g, separator)
    .replace(/(^\s*|[,;]\s*)\*+\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.])/g, '$1')
    .replace(/([,;])(?:\s*[,;])+/g, '$1')
    .replace(/^[\s,;:.—–-]+|[\s,;:—–-]+$/g, '')
    .trim()
  if (!text || /[{}[\]|=]/.test(text)) return null
  return limited(text)
}

async function readEntities(ids) {
  const result = new Map()
  for (const batch of chunk(ids, 50)) {
    const url = new URL('https://www.wikidata.org/w/api.php')
    url.search = new URLSearchParams({ action: 'wbgetentities', format: 'json', props: 'claims', ids: batch.join('|') })
    const body = await getJson(url)
    for (const [id, entity] of Object.entries(body.entities ?? {})) result.set(id, entity.claims ?? {})
  }
  return result
}

async function readLabels(ids) {
  const result = new Map()
  for (const batch of chunk(ids, 50)) {
    const url = new URL('https://www.wikidata.org/w/api.php')
    url.search = new URLSearchParams({ action: 'wbgetentities', format: 'json', props: 'labels', languages: 'pt-br|pt', ids: batch.join('|') })
    const body = await getJson(url)
    for (const [id, entity] of Object.entries(body.entities ?? {})) {
      const label = entity.labels?.['pt-br']?.value ?? entity.labels?.pt?.value
      if (label) result.set(id, label.trim())
    }
  }
  return result
}

function referencedItems(claims) {
  const places = ['P19', 'P20', 'P119'].flatMap((property) => best(claims, property).slice(0, 1).map(itemOf))
  const lists = ['P611', 'P4185'].flatMap((property) => best(claims, property).map(itemOf))
  const religions = statements(claims, 'P841').flatMap((statement) => qualifierItems(statement, 'P140'))
  const canonizers = statements(claims, 'P411').flatMap((statement) => qualifierItems(statement, 'P1027'))
  return [...places, ...lists, ...religions, ...canonizers].filter(Boolean)
}

function lifeOf(claims, labels) {
  const birth = eventOf(claims, 'P569', 'P19', labels)
  const death = eventOf(claims, 'P570', 'P20', labels)
  const burial = labelList(best(claims, 'P119').slice(0, 1).map(itemOf), labels)
  const order = labelList(best(claims, 'P611').map(itemOf), labels)
  if (!birth && !death && !burial && !order) return null
  const life = {}
  if (birth) life.birth = birth
  if (death) life.death = death
  if (burial) life.burial = capitalize(burial)
  if (order) life.order = capitalize(order)
  return life
}

const droppedLabels = new Set()

function labelList(ids, labels, accepts = () => true) {
  const names = []
  for (const label of ids.map((id) => labels.get(id)).filter(Boolean)) {
    if (ITEM_ID.test(label) || ENGLISH_LABEL.test(label) || !accepts(label)) droppedLabels.add(label)
    else if (!names.includes(label)) names.push(label)
  }
  return names.length > 0 ? limited(names.join(', ')) : null
}

function limited(text) {
  if (text.length <= MAX_FIELD_LENGTH) return text
  const cut = text.slice(0, MAX_FIELD_LENGTH)
  const last = Math.max(cut.lastIndexOf(';'), cut.lastIndexOf(','))
  return last < 20 ? null : cut.slice(0, last).trim()
}

function eventOf(claims, dateProperty, placeProperty, labels) {
  const dateStatement = best(claims, dateProperty)[0]
  const date = dateStatement ? dateText(dateStatement.mainsnak.datavalue.value, isCirca(dateStatement)) : null
  const placeStatement = best(claims, placeProperty)[0]
  const place = placeStatement ? labels.get(itemOf(placeStatement)) ?? null : null
  return [date, place].filter(Boolean).join(', ') || null
}

function venerationOf(claims, labels, infobox, day) {
  const veneration = {}
  const statuses = statements(claims, 'P411').filter((statement) => SAINT_STATUS.has(itemOf(statement)))

  const blessed = statements(claims, 'P411').filter((statement) => itemOf(statement) === BLESSED)
  const deathYear = deathYearOf(claims)

  const veneratedBy = christianOnly(infobox.veneratedBy) ?? christianOnly(churchesOf(claims, labels, statuses))
  if (veneratedBy) veneration.veneratedBy = veneratedBy

  const fromInfobox = infobox.beatification && isPlausibleStatusYear(lastYearOf(infobox.beatification), deathYear) ? infobox.beatification : null
  const beatification = fromInfobox ?? statusDateOf(blessed, deathYear)
  if (beatification) veneration.beatification = beatification

  const canonization = infobox.canonization ?? canonizationOf(statuses, deathYear)
  if (canonization) veneration.canonization = canonization

  const canonizedBy = canonizerOf(statuses, labels)
  if (canonizedBy) veneration.canonizedBy = canonizedBy

  veneration.feast = feastOf(day)

  if (infobox.patronOf) veneration.patronOf = infobox.patronOf

  const attributes = infobox.attributes ?? labelList(best(claims, 'P4185').map(itemOf), labels)
  if (attributes) veneration.attributes = capitalize(attributes)

  return veneration
}

function canonizerOf(statuses, labels) {
  for (const statement of statuses) {
    const canonizer = labelList(qualifierItems(statement, 'P1027'), labels, (label) => /^Papa\s/.test(label))
    if (canonizer) return canonizer
  }
  return null
}

function lastYearOf(text) {
  const years = text.match(/\b\d{3,4}\b/g)
  return years ? Number(years[years.length - 1]) : null
}

function isPlausibleStatusYear(year, deathYear) {
  return year !== null && year >= FIRST_CANONIZATION_YEAR && (deathYear === null || year >= deathYear)
}

function christianOnly(text) {
  if (!text) return null
  const kept = [...new Set(text.split(/\s*,\s*/).filter((part) => CHRISTIAN_CHURCH.test(part)))]
  return kept.length > 0 ? kept.join(', ') : null
}

function churchesOf(claims, labels, statuses) {
  const churches = new Set()
  if (statuses.some((statement) => CATHOLIC_STATUS.has(itemOf(statement)))) churches.add('Igreja Católica')
  for (const statement of statements(claims, 'P841')) {
    if (qualifierItems(statement, 'P361').some((id) => GENERAL_ROMAN_CALENDAR.has(id))) churches.add('Igreja Católica')
    for (const id of qualifierItems(statement, 'P140')) {
      if (CATHOLIC_RELIGIONS.has(id)) churches.add('Igreja Católica')
      else if (labels.has(id)) churches.add(capitalize(labels.get(id)))
    }
  }
  return churches.size > 0 ? [...churches].join(', ') : null
}

function canonizationOf(statuses, deathYear) {
  return statusDateOf(statuses, deathYear) ?? (statuses.some((statement) => itemOf(statement) === PRE_CONGREGATION) ? 'Pré-congregação' : null)
}

function statusDateOf(statuses, deathYear) {
  for (const statement of statuses) {
    const qualifier = statement.qualifiers?.P585?.[0] ?? statement.qualifiers?.P580?.[0]
    if (qualifier?.snaktype !== 'value') continue
    if (!isPlausibleStatusYear(yearOf(qualifier.datavalue.value), deathYear)) continue
    const text = dateText(qualifier.datavalue.value, false)
    if (text) return text
  }
  return null
}

function deathYearOf(claims) {
  const statement = best(claims, 'P570')[0]
  return statement ? yearOf(statement.mainsnak.datavalue.value) : null
}

function yearOf(value) {
  const parts = /^([+-])(\d+)-/.exec(value?.time ?? '')
  if (!parts) return null
  return parts[1] === '-' ? -Number(parts[2]) : Number(parts[2])
}

function feastOf(day) {
  const [month, date] = day.split('-').map(Number)
  return `${date === 1 ? '1º' : date} de ${MONTHS[month - 1]}`
}

function dayMonthYear(day, month, year) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${day === 1 ? '1º' : day} de ${MONTHS[month - 1]} de ${year}`
}

function dateText(value, circa) {
  const parts = /^([+-])(\d+)-(\d\d)-(\d\d)/.exec(value?.time ?? '')
  if (!parts) return null
  const year = Number(parts[2])
  if (year === 0) return null
  const era = parts[1] === '-' ? ' a.C.' : ''
  const month = Number(parts[3])
  const date = Number(parts[4])
  let text
  switch (value.precision) {
    case 11:
      text = month && date ? `${date === 1 ? '1º' : date} de ${MONTHS[month - 1]} de ${year}${era}` : null
      break
    case 10:
      text = month ? `${MONTHS[month - 1]} de ${year}${era}` : null
      break
    case 9:
      text = `${year}${era}`
      break
    case 8:
      text = `década de ${Math.floor(year / 10) * 10}${era}`
      break
    case 7:
      text = `século ${roman(Math.ceil(year / 100))}${era}`
      break
    default:
      text = null
  }
  return text && circa ? `c. ${text}` : text
}

function isCirca(statement) {
  return qualifierItems(statement, 'P1480').includes(CIRCA)
}

function statements(claims, property) {
  return (claims[property] ?? []).filter((statement) => statement.rank !== 'deprecated' && statement.mainsnak?.snaktype === 'value')
}

function best(claims, property) {
  const list = statements(claims, property)
  const preferred = list.filter((statement) => statement.rank === 'preferred')
  return preferred.length > 0 ? preferred : list
}

function itemOf(statement) {
  return statement.mainsnak?.datavalue?.value?.id ?? null
}

function qualifierItems(statement, property) {
  return (statement.qualifiers?.[property] ?? [])
    .filter((snak) => snak.snaktype === 'value')
    .map((snak) => snak.datavalue?.value?.id)
    .filter(Boolean)
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function roman(value) {
  const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let rest = value
  let result = ''
  for (const [amount, letters] of table) {
    while (rest >= amount) {
      result += letters
      rest -= amount
    }
  }
  return result
}

await main()
