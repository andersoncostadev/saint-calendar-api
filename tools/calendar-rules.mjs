// Regras de texto do retrato: título, crédito da foto e pontuação.
// O pedido do dia não usa este arquivo; só os scripts que geram o catálogo.

const FEMALE = 'Q6581072'
const MALE = 'Q6581097'

export const RELIGIOUS_TYPES = new Set([
  'Q1509831', // título de Maria
  'Q60075825', // festividade cristã
  'Q106355253', // episódio do Evangelho
  'Q7361876', // dogmas da Igreja Católica
  'Q85853098', // dogma mariano
  'Q1621783', // solenidade
  'Q16334295', // grupo de humanos
  'Q109288825', // dupla masculina
  'Q109289221', // dupla feminina
  'Q132776456', // dupla de irmãos gêmeos
  'Q20643955', // personagem bíblico humano
  'Q178342', // arcanjo
  'Q10822464', // anjo no cristianismo
  'Q728388', // anjo da guarda
])

export const FEAST_REQUIRED_TYPES = new Set([
  'Q16334295',
  'Q109288825',
  'Q109289221',
  'Q132776456',
  'Q20643955',
])

const MOVABLE = [
  'sagrado coracao de jesus',
  'imaculado coracao de maria',
  'cristo rei',
  'batismo do senhor',
  'sagrada familia',
  'santissima trindade',
  'corpus christi',
  'pentecostes',
  'ascensao',
  'pascoa',
]

const MONTHS = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

export function fold(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function isMovableCelebration(name) {
  const stripped = fold(name)
    .replace(/^(solenidade|festa|memoria|domingo)\s+(do|da|de|dos|das)\s+/, '')
    .replace(/^(solenidade|festa|memoria|domingo)\s+/, '')
  return MOVABLE.some((feast) => stripped.startsWith(feast))
}

export function collapsePunctuation(text) {
  return text.replace(/([,;:])(?:\s*\1)+/g, '$1')
}

export function plainText(html) {
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
}

const UNKNOWN_PHRASES = [
  /original author unknown[^.;,]*/gi,
  /unknown spanish painter/gi,
  /anonymous byzantine painter[^.;,]*/gi,
  /unknown photographer/gi,
  /unknown author/gi,
  /unknown artist/gi,
  /unknown autor/gi,
  /artist unknow/gi,
  /op unknown/gi,
  /auteur inconnu[^.;,]*/gi,
  /\ban[oóô]nim[oa]s?\b[^.;,]*/gi,
  /\bunidentified\b[^.;,]*/gi,
  /\banonymous\b/gi,
  /\bunknown\b/gi,
]

export function authorOf(html) {
  let text = plainText(html)
  text = text.replace(/no machine-readable author provided\.?/gi, '')
  text = text.replace(/([A-Za-zÀ-ÿ0-9_. -]+?)\s+assumed\s*\(based on copyright claims\)\.?/gi, '$1')
  text = text.replace(/i'd appreciate[\s\S]*$/i, '')
  text = text.replace(/this file is licensed under[\s\S]*$/i, '')
  text = text.replace(/public domain image/gi, '')
  text = text.replace(/\bpublic domain\b/gi, '')
  text = text.replace(/originally uploaded by [^.;]+/gi, '')
  text = text.replace(/\b[\w.-]+\.(?:jpe?g|png|webp|svg|gif)\s*:/gi, '')
  text = text.replace(/derivative work\s*:/gi, '; ')
  text = text.replace(/\( talk \)/gi, '')
  text = text.replace(/\bUser:/gi, '')
  text = text.replace(/photo taken by\s+/gi, 'foto: ')
  for (const pattern of UNKNOWN_PHRASES) text = text.replace(pattern, 'Autor desconhecido')
  text = text.replace(/\b([\p{L}][\p{L}0-9_.-]*)\s+\(\s*\1\s*\)/giu, '$1')
  text = dedupePhrase(text)
  text = text.replace(/(?:Autor desconhecido\s*){2,}/gi, 'Autor desconhecido ')
  text = text.replace(/\s*([;,])\s*/g, '$1 ')
  text = text.replace(/^(?:[;,]\s*)+|(?:[;,]|\s)+$/g, '')
  text = text.replace(/\s+/g, ' ').trim()
  if (/^Autor desconhecido\b/i.test(text) && !/foto:|\//.test(text) && /painter|icon|photo|painting/i.test(text)) {
    return 'Autor desconhecido'
  }
  if (!text || /^autor desconhecido(?:\s*[;,]\s*autor desconhecido)*$/i.test(text)) return 'Autor desconhecido'
  return limitAuthor(text)
}

function dedupePhrase(text) {
  let current = text
  for (let pass = 0; pass < 4; pass += 1) {
    const next = current.replace(/(\b[\p{L}][\p{L}\s.'’-]{2,}?)\s+\1\b/giu, '$1')
    if (next === current) break
    current = next
  }
  return current
}

export function limitAuthor(text) {
  if (text.length <= 80) return text
  const cut = text.slice(0, 80)
  const last = Math.max(cut.lastIndexOf(';'), cut.lastIndexOf(','), cut.lastIndexOf(':'))
  return (last > 0 ? cut.slice(0, last) : cut).trim()
}

export function licenseName(license) {
  return /^public domain$/i.test(license.trim()) ? 'Domínio público' : license
}

export function startsWithVowelOrH(name) {
  const first = fold(name).replace(/^[^a-z]+/, '')[0]
  return Boolean(first && 'aeiouh'.includes(first))
}

export function sexOf(typeIds) {
  if (typeIds.includes(FEMALE)) return 'female'
  if (typeIds.includes(MALE)) return 'male'
  return null
}

export function cancaoNovaTitle(core, sex) {
  let name = core.replace(/^(São|Santo|Santa|Santos|Santas|Beato|Beata|Beatos|Beatas)\s+Papa\s+/i, '$1 ')
  name = name.replace(/^San\s+/i, 'São ')
  if (/^Papa\s+/i.test(name)) name = `${sex === 'female' ? 'Santa' : honorificBefore(name.replace(/^Papa\s+/i, ''))} ${name.replace(/^Papa\s+/i, '')}`
  if (/\s+e\s+/i.test(name)) return name.trim()
  const match = /^(São|Santo|Santa|Beato|Beata)\s+(.+)$/.exec(name)
  if (!match) return name.trim()
  const [, honorific, rest] = match
  if (sex === 'female' && (honorific === 'São' || honorific === 'Santo')) return `Santa ${rest}`
  if (sex === 'female' && honorific === 'Beato') return `Beata ${rest}`
  if (sex === 'male' && honorific === 'Santa') return `${honorificBefore(rest)} ${rest}`
  if (sex === 'male' && honorific === 'Beata') return `Beato ${rest}`
  return name.trim()
}

export function wikidataTitle(label, { saint, blessed, sex }) {
  const bare = label
    .replace(/^(são|santo|santa|santos|santas|beato|beata|beatos|beatas)\s+/i, '')
    .replace(/^papa\s+/i, '')
    .trim()
  if (!bare) return label.trim()
  if (!saint && !blessed) return bare
  if (blessed && !saint) return `${sex === 'female' ? 'Beata' : 'Beato'} ${bare}`
  if (sex === 'female') return `Santa ${bare}`
  return `${honorificBefore(bare)} ${bare}`
}

function honorificBefore(name) {
  return startsWithVowelOrH(name) ? 'Santo' : 'São'
}

export function dayKeyFromLabel(label) {
  const text = label.trim().toLowerCase()
  const portuguese = /^(\d{1,2}) de ([a-zç]+)$/.exec(text)
  const dayMonth = /^(\d{1,2}) ([a-z]+)$/.exec(text)
  const monthDay = /^([a-z]+) (\d{1,2})$/.exec(text)
  const day = portuguese ? Number(portuguese[1]) : dayMonth ? Number(dayMonth[1]) : monthDay ? Number(monthDay[2]) : 0
  const monthName = portuguese ? portuguese[2] : dayMonth ? dayMonth[2] : monthDay ? monthDay[1] : ''
  const month = MONTHS[monthName] ?? 0
  if (!month || day < 1 || day > 31) return null
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
