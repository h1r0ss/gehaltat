// Removes age and gender markers ("M27", "25w", "(m, 31)", "age 35", "female") from the text the
// site publishes (post titles, job titles, notes, evidence). Reddit salary titles often start with
// them; the benchmark needs neither, so the published copy drops them (data minimisation). The
// figures are checked against the unredacted text first, in build-dataset.mjs.
const PATTERNS = [
  /[([]\s*(?:[mwfd]\s*[,/|]?\s*\d{2}|\d{2}\s*[,/|]?\s*[mwfd])\s*[)\]]/gi, // (m, 31) [31/w] (M27)
  /\b[mwf]\s*\/\s*\d{2}\b|\b\d{2}\s*\/\s*[mwf]\b/gi, // m/27, 27/w
  /\b(?:[MWF] ?\d{2}|[mwf]\d{2}|\d{2} ?[MWF]|\d{2}[mwf])\b/g, // M27, M 27, m27, 27M, 27 M, 27m
  /\b(?:age|alter)\s*~?\s*\d{2}(?:\s*(?:→|->|–|-)\s*\d{2})?/gi, // age 35, age ~39, age 14→26
  /\b\d{2}\s?(?:jahre|j\.)\s?alt\b/gi, // 31 Jahre alt
  /\b\d{2}\s?(?:years?|yrs?)\s?old\b|\b\d{2}\s?y\/?o\b/gi, // 31 years old, 31yo, 31 y/o
  /\b(?:female|male|weiblich|männlich)\b/gi,
];

/** A title that opens with the marker, e.g. "M20 I Rettungssanitäter I Wien" (capital I as a separator). */
const LEADING_MARKER = /^\s*[([]?\s*(?:[mwf]\s?\d{2}|\d{2}\s?[mwf])\b/i;

export function redactAgeGender(text) {
  if (typeof text !== 'string' || text === '') return text;
  let result = text;
  for (const pattern of PATTERNS) result = result.replace(pattern, ' ');
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
    .replace(/([,;])(?:\s*[,;])+/g, '$1')
    .replace(/([.!?])\s*[,;]/g, '$1')
    .replace(/\s+[/|·–-]\s*([,;])/g, '$1')
    .replace(/\s[/|·–-](?:\s+[/|·–-])+\s/g, (match) => ` ${match.trim()[0]} `)
    .replace(/^[\s,;:./|·–-]+/, '')
    .replace(/[\s,;:/|·–-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
