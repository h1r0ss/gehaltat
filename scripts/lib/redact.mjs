// Removes age and gender markers ("M27", "25w", "(m, 31)", "age 35", "female", "27-jähriger Mann")
// and family circumstances ("+166€ Familienbonusplus", "4 Jahre Karenz", "Elternteilzeit") from the
// text the site publishes (post titles, job titles, notes and their German translations, evidence).
// Reddit salary titles often start with them; the benchmark needs none of it, so the published copy
// drops them (data minimisation). The figures are checked against the unredacted text first, in
// build-dataset.mjs.
const PATTERNS = [
  /[([]\s*(?:[mwfd]\s*[,/|]?\s*\d{2}|\d{2}\s*[,/|]?\s*[mwfd])\s*[)\]]/gi, // (m, 31) [31/w] (M27)
  /\b[mwf]\s*\(\s*\d{2}\s*\)/gi, // M (34), m(20)
  /[([]\s*(?:1[6-9]|[2-6]\d)\s*[)\]]/g, // a bare age in brackets: "Projektleiter (26)"
  /[([]\s*(?:mann|frau|man|woman)\s*[)\]]/gi, // (Mann)
  /\b[mwf]\s*\/\s*\d{2}\b|\b\d{2}\s*\/\s*[mwf]\b/gi, // m/27, 27/w
  // M27, M 27, m27, 27M, 27 M, 27m, but not amounts in millions ("~25M revenue", "20M EUR", "€20m")
  /(?<![€$~]\s?|[.,\d])\b(?:[MWF] ?\d{2}|[mwf]\d{2}|\d{2} ?[MWF]|\d{2}[mwf])\b(?!\s*(?:€|[Ee][Uu][Rr]|[Ee]uro|USD|\$|[Rr]evenue|[Uu]msatz|[Tt]urnover|[Bb]udget|[Aa]nnual|[Pp]roje[ck]t))/g,
  /\b(?:age|alter)\s*~?\s*\d{2}(?:\s*(?:→|->|–|-|bis|to)\s*\d{2})?/gi, // age 35, age ~39, age 14→26, Alter 14 bis 26
  /\b\d{2}\s?(?:jahre|j\.)\s?alt\b/gi, // 31 Jahre alt
  /\b\d{2}[\s-]?(?:years?|yrs?)[\s-]?old\b(?:\s+(?:man|woman|guy)\b)?|\b\d{2}\s?y\/?o\b/gi, // 31 years old, 28-year-old (man), 31yo, 31 y/o
  /\b(?:early|mid|late)[\s-]?[2-6]0s\b/gi, // early 30s
  /\b(?:anfang|mitte|ende)\s+(?:[2-6]0|zwanzig|dreißig|vierzig|fünfzig|sechzig)\b(?!\s*(?:std|h\b|stunden|uhr|%|€|prozent|mitarbeiter))/gi, // Anfang 30
  /\b\d{2}\s?-\s?jährige[rn]?\s+(?:mann|frau)\b/gi, // 27-jähriger Mann (German notes)
  /\b\d{2}\s?-\s?Jährige[rn]?\b/g, // (für einen) 28-Jährigen
  /(?<=^|[.;:(]\s{0,2})\d{2}\s?-\s?jährige?[rn]?(?=\s*[,;.)])/gi, // "26-jährig, M.Sc. ..."
  /\b(?:female|male|weiblich|männlich)\b/gi,
];

// Family circumstances: the amount of a family tax bonus, parental leave, parental part-time (the
// part-time itself stays). "Karenzvertretung" (a maternity-cover job) is a job type and stays.
const FAMILY_PATTERNS = [
  [/\+?\s*\d+(?:[.,]\d+)?\s*€?\s*familienbonus(?:\s?plus)?\b/gi, ' '],
  [/\bfamilienbonus(?:\s?plus)?\b/gi, ' '],
  [/\b\d+\s*(?:jahre?|monate?)\s+(?:eltern)?karenz\b(?:\s+dazwischen)?/gi, ' '],
  [/\b(?:eltern)?karenz\b/gi, ' '],
  [/\belternteilzeit\b/gi, 'Teilzeit'],
];

/** A title that opens with the marker, e.g. "M20 I Rettungssanitäter I Wien" (capital I as a separator). */
const LEADING_MARKER = /^\s*[([]?\s*(?:[mwf]\s?\d{2}|\d{2}\s?[mwf])\b/i;

export function redactPersonal(text) {
  if (typeof text !== 'string' || text === '') return text;
  let result = text;
  for (const pattern of PATTERNS) result = result.replace(pattern, ' ');
  for (const [pattern, replacement] of FAMILY_PATTERNS) result = result.replace(pattern, replacement);
  if (result === text) return text;
  if (LEADING_MARKER.test(text)) result = result.replace(/^\s*I\s+(?=\S)/, '');
  return tidy(result);
}

// Cleans up what a removed token leaves behind: empty brackets, doubled separators, stray
// separators at the start or end, and spaces before punctuation.
function tidy(text) {
  return text
    .replace(/[([]\s*[)\]]/g, ' ')
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/([.!?])(?:\s*\.)+/g, '$1')
    .replace(/([,;])(?:\s*[,;])+/g, '$1')
    .replace(/([.!?])\s*[,;]/g, '$1')
    .replace(/\s+[/|·–-]\s*([,;])/g, '$1')
    .replace(/\s[/|·–-](?:\s+[/|·–-])+\s/g, (match) => ` ${match.trim()[0]} `)
    .replace(/^[\s,;:./|·–-]+/, '')
    .replace(/[\s,;:/|·–-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
