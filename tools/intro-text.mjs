const ABBREVIATIONS = new Set(['c', 'ca', 'cf', 'd', 'dr', 'fl', 'fr', 'm', 'n', 'pe', 's', 'sec', 'séc', 'sr', 'sra', 'st', 'sta', 'sto'])
const NON_LATIN = /[\u0250-\u02AF\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u10A0-\u10FF\u1200-\u137F\u2C80-\u2CFF]/

export function firstSentence(text) {
  const [end] = sentenceEnds(text)
  return end === undefined ? '' : text.slice(0, end).trim()
}

export function sentencesOf(text) {
  let start = 0
  return sentenceEnds(text).map((end) => {
    const sentence = text.slice(start, end).trim()
    start = end
    return sentence
  })
}

function sentenceEnds(text) {
  const ends = []
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '(' || char === '[') depth += 1
    else if ((char === ')' || char === ']') && depth > 0) depth -= 1
    else if (depth === 0 && '.!?'.includes(char)) {
      const rest = text.slice(index + 1)
      if (rest !== '' && !/^\s+["“«(]?[A-ZÀ-Ý]/.test(rest)) continue
      const word = (/(\S+)$/.exec(text.slice(0, index))?.[1] ?? '').replace(/^\(/, '')
      if (rest !== '' && (/^[A-ZÀ-Ý]$/.test(word) || word.includes('.') || ABBREVIATIONS.has(word.toLowerCase()))) continue
      ends.push(index + 1)
    }
  }
  return ends
}

export function withoutLanguageNotes(text) {
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

export function tidy(text) {
  return text
    .replace(/\(\s*[;,]?\s*\)/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
