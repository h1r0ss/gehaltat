// Role-family search: similar job titles (e.g. Project Manager, Project Lead,
// IT Project Manager) count as one role so the benchmark has enough salaries.
// Pure functions, imported by Node tests. Dataset.roleFamilies may be `[]`
// (the data pipeline can deliver it after the UI ships); every function here
// degrades gracefully to "no family matched" in that case.
//
// Matching works on words, not raw substrings, so "HR" finds Personalwesen
// without also matching the "hr" inside "Lehrer" or "Fahrer". A query is
// compared with each family's labels and aliases in three tiers, and only the
// best tier counts: the exact term ("Softwareentwickler", also written
// "Software Entwickler"), then word starts ("project man", or a whole alias
// inside a longer query as in "Senior Software Engineer"), then the head of a
// compound ("Entwickler" in "Softwareentwickler"), then anything inside a
// compound word. So "Arzt" finds Medizin (an exact alias) but not Tierarzt,
// and "Pflege" finds the nursing groups but not Tierpflege.
import type { Lang } from '../i18n/translate.ts';
import type { RoleFamily, SalaryRecord } from '../types.ts';
import { normalizeText } from './filters.ts';

export type RoleFamilyMatch = {
  /** Every family the query resolved to: one, or several when the query is ambiguous ("Berater"). */
  families: RoleFamily[];
  /** Records whose `roleFamily` is one of `families`. */
  records: SalaryRecord[];
  /**
   * Set when the whole query matched nothing and only its last word did
   * ("SAP Berater" -> "Berater", as typed), so the UI can say the match is looser.
   */
  headWord: string | null;
};

export type RoleFamilySuggestion = { family: RoleFamily; label: string; count: number };

/** Words that say nothing about the role itself: seniority, gender markers ("m/w/d", ":in"), fillers. */
const IGNORED_WORDS = new Set([
  'senior', 'sr', 'junior', 'jr', 'mid', 'medior', 'principal',
  'in', 'innen', 'm', 'w', 'd', 'x', 'f',
  'und', 'and', 'of', 'the', 'fur', 'for',
]);

/** Words this short ("IT", "HR", "PM") only match at the start of a word, never inside a compound. */
const SHORT_WORD = 3;

/** Lower-cased, diacritics-free words of a label, alias or query. */
export function roleWords(text: string): string[] {
  return normalizeText(text).split(/[^a-z0-9]+/).filter(Boolean);
}

function queryWords(query: string): string[] {
  return roleWords(query).filter((word) => !IGNORED_WORDS.has(word));
}

/** The word itself plus its masculine form: "elektrikerin" -> "elektriker", "kauffrau" -> "kaufmann". */
function wordVariants(word: string): string[] {
  const variants = [word];
  if (word.endsWith('innen') && word.length >= 8) variants.push(word.slice(0, -5));
  else if (word.endsWith('in') && word.length >= 6) variants.push(word.slice(0, -2));
  if (word.endsWith('frau')) variants.push(`${word.slice(0, -4)}mann`);
  return variants;
}

type Term = { words: string[]; compact: string };
type FamilyIndex = { family: RoleFamily; terms: Term[]; words: string[] };

const indexCache = new WeakMap<readonly RoleFamily[], FamilyIndex[]>();

function familyIndex(families: readonly RoleFamily[]): FamilyIndex[] {
  let index = indexCache.get(families);
  if (!index) {
    index = families.map((family) => {
      const terms = [family.label, family.labelDe, ...family.aliases].map((text) => {
        const words = roleWords(text);
        return { words, compact: words.join('') };
      });
      return { family, terms, words: [...new Set(terms.flatMap((term) => term.words))] };
    });
    indexCache.set(families, index);
  }
  return index;
}

/** 1 = exact term, 2 = word starts, 3 = head of a compound, 4 = inside a compound. `covered` ranks within a tier. */
export type MatchTier = 1 | 2 | 3 | 4;
type Score = { tier: MatchTier; covered: number };

function better(a: Score, b: Score | null): boolean {
  return b === null || a.tier < b.tier || (a.tier === b.tier && a.covered > b.covered);
}

function someVariant(word: string, test: (variant: string) => boolean): boolean {
  return wordVariants(word).some(test);
}

function wordEdge(variant: string, candidate: string): boolean {
  return candidate.startsWith(variant) || (variant.length > SHORT_WORD && candidate.endsWith(variant));
}

function scoreFamily(entry: FamilyIndex, words: readonly string[]): Score | null {
  const compacts = new Set([words.join(''), words.map((word) => wordVariants(word).at(-1) ?? word).join('')]);
  let best: Score | null = null;
  const consider = (score: Score) => {
    if (better(score, best)) best = score;
  };
  for (const term of entry.terms) {
    if (term.words.length === 0) continue;
    for (const compact of compacts) {
      // Spaces and hyphens do not matter: "Software Entwickler", "LKW Fahrer".
      if (compact === term.compact) consider({ tier: 1, covered: words.length });
      // Still typing ("projektl") or written together ("fullstack"); short queries only at a word start.
      else if (term.compact.startsWith(compact) && (compact.length > SHORT_WORD || term.words[0].startsWith(compact))) {
        consider({ tier: 2, covered: words.length });
      }
    }
    // Every query word starts a word of this term: "project man", "IT support".
    if (words.every((word) => someVariant(word, (variant) => term.words.some((candidate) => candidate.startsWith(variant))))) {
      consider({ tier: 2, covered: words.length });
    } else if (words.every((word) => someVariant(word, (variant) => term.words.some((candidate) => wordEdge(variant, candidate))))) {
      // ... or, from four letters on, ends one: the head of a compound ("techniker" in "Elektrotechniker").
      consider({ tier: 3, covered: words.length });
    }
    // The whole term is in the query: "senior software engineer wien" contains "software engineer".
    if (term.words.every((termWord) => words.some((word) => someVariant(word, (variant) => variant === termWord)))) {
      consider({ tier: 2, covered: term.words.length });
    }
  }
  // Every query word is somewhere inside a word of the family: "technik" in "elektrotechniker".
  const inCompound = words.every((word) =>
    someVariant(word, (variant) =>
      entry.words.some((candidate) => (variant.length <= SHORT_WORD ? candidate === variant : candidate.includes(variant))),
    ),
  );
  if (inCompound) consider({ tier: 4, covered: words.length });
  return best;
}

type Ranked = { family: RoleFamily; score: Score };

function rank(families: readonly RoleFamily[], words: readonly string[]): Ranked[] {
  const ranked: Ranked[] = [];
  for (const entry of familyIndex(families)) {
    const score = scoreFamily(entry, words);
    if (score) ranked.push({ family: entry.family, score });
  }
  return ranked.sort((a, b) => a.score.tier - b.score.tier || b.score.covered - a.score.covered);
}

/** The families of the best tier (and, within it, the best coverage). */
function bestOf(ranked: readonly Ranked[]): RoleFamily[] {
  if (ranked.length === 0) return [];
  const { tier, covered } = ranked[0].score;
  return ranked.filter((r) => r.score.tier === tier && r.score.covered === covered).map((r) => r.family);
}

/** The query's last word long enough to stand for the role ("SAP Berater" -> "berater"); `null` for one-word queries. */
function headWordOf(words: readonly string[]): string | null {
  if (words.length < 2) return null;
  return [...words].reverse().find((word) => word.length > SHORT_WORD) ?? null;
}

type Search = { families: RoleFamily[]; headWord: string | null };

/** `word` as the visitor typed it ("Berater", not "berater"), for display. */
function typedForm(query: string, word: string): string {
  return query.split(/[^\p{L}\p{N}]+/u).find((raw) => normalizeText(raw) === word) ?? word;
}

function search(families: readonly RoleFamily[], query: string): Search {
  const words = queryWords(query);
  if (words.length === 0) return { families: [], headWord: null };
  const direct = bestOf(rank(families, words));
  if (direct.length > 0) return { families: direct, headWord: null };
  const headWord = headWordOf(words);
  if (headWord === null) return { families: [], headWord: null };
  const viaHead = bestOf(rank(families, [headWord]));
  return viaHead.length > 0 ? { families: viaHead, headWord: typedForm(query, headWord) } : { families: [], headWord: null };
}

/** True when `query` matches the family in any tier (see the file comment). */
export function familyMatches(family: RoleFamily, query: string): boolean {
  const words = queryWords(query);
  return words.length > 0 && scoreFamily(familyIndex([family])[0], words) !== null;
}

/** The families the finder resolves `query` to: the best-matching tier only. */
export function matchRoleFamilies(families: readonly RoleFamily[], query: string): RoleFamily[] {
  return search(families, query).families;
}

/** Records whose `roleFamily` is one of `families`' ids. */
export function recordsForFamilies(records: readonly SalaryRecord[], families: readonly RoleFamily[]): SalaryRecord[] {
  if (families.length === 0) return [];
  const ids = new Set(families.map((family) => family.id));
  return records.filter((record) => record.roleFamily !== null && ids.has(record.roleFamily));
}

/**
 * Resolves the finder's free-text role query against the dataset's role
 * families. `null` means the query matched no family (including when there
 * are no families yet), so the caller should fall back to the existing
 * substring search over individual job titles.
 */
export function resolveRoleFamilyQuery(
  families: readonly RoleFamily[],
  records: readonly SalaryRecord[],
  query: string,
): RoleFamilyMatch | null {
  const { families: matched, headWord } = search(families, query);
  if (matched.length === 0) return null;
  return { families: matched, records: recordsForFamilies(records, matched), headWord };
}

/** Every family matching `query` in any tier, best first; falls back to the last word like the finder. */
function rankWithFallback(families: readonly RoleFamily[], query: string): Ranked[] {
  const words = queryWords(query);
  if (words.length === 0) return [];
  const ranked = rank(families, words);
  if (ranked.length > 0) return ranked;
  const headWord = headWordOf(words);
  return headWord === null ? [] : rank(families, [headWord]);
}

/**
 * Every family `query` matches in any tier, best first, so the autocomplete
 * can offer a looser match ("Tierarzt" for "arzt") to pick on purpose even
 * though the finder itself resolves to the best tier only.
 */
export function rankRoleFamilies(families: readonly RoleFamily[], query: string): RoleFamily[] {
  return rankWithFallback(families, query).map((r) => r.family);
}

export type RoleOptions = {
  /** `popular` for an empty query, `matches` for families the query finds, `similar` for "did you mean". */
  kind: 'popular' | 'matches' | 'similar';
  options: RoleFamilySuggestion[];
};

/**
 * What the role autocomplete lists for `query`: the most-posted families
 * while the field is empty, else every matching family (best match first,
 * then most salaries), else typo-tolerant guesses. `suggestions` (see
 * roleFamilySuggestions) supplies labels and counts; families without
 * salaries are never offered.
 */
export function roleOptions(
  families: readonly RoleFamily[],
  suggestions: readonly RoleFamilySuggestion[],
  query: string,
  limit = 8,
): RoleOptions {
  if (queryWords(query).length === 0) return { kind: 'popular', options: suggestions.slice(0, limit) };
  const byId = new Map(suggestions.map((suggestion) => [suggestion.family.id, suggestion]));
  const ranked = rankWithFallback(families, query)
    .map((r) => ({ ...r, suggestion: byId.get(r.family.id) }))
    .filter((r): r is Ranked & { suggestion: RoleFamilySuggestion } => r.suggestion !== undefined)
    .sort((a, b) => a.score.tier - b.score.tier || b.score.covered - a.score.covered || b.suggestion.count - a.suggestion.count);
  if (ranked.length > 0) return { kind: 'matches', options: ranked.slice(0, limit).map((r) => r.suggestion) };
  const similar = suggestSimilarFamilies(families, query)
    .map((family) => byId.get(family.id))
    .filter((suggestion): suggestion is RoleFamilySuggestion => suggestion !== undefined);
  return { kind: 'similar', options: similar.slice(0, limit) };
}

/** Levenshtein distance between two words. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** Edit distance from `word` to the closest part of `target` (a typo inside a compound word). */
export function partialEditDistance(word: string, target: string): number {
  let previous: number[] = new Array(target.length + 1).fill(0);
  for (let i = 1; i <= word.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= target.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (word[i - 1] === target[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return Math.min(...previous);
}

/**
 * "Did you mean" candidates for a query that matched no family, closest
 * first. Every word of five or more letters must be one edit away from a word
 * of the family with the same first three letters ("sofware" -> "software",
 * but "bäcker" is not "banker"), or, from eight letters on, from
 * part of a compound ("entwikler" in "softwareentwickler"; two edits from ten
 * letters). Shorter words are ignored, so a stray "IT" does not block a hit.
 */
export function suggestSimilarFamilies(families: readonly RoleFamily[], query: string): RoleFamily[] {
  const words = queryWords(query).filter((word) => word.length >= 5);
  if (words.length === 0) return [];
  const found: Array<{ family: RoleFamily; distance: number }> = [];
  for (const entry of familyIndex(families)) {
    let total = 0;
    for (const word of words) {
      const distance = Math.min(
        ...entry.words.map((candidate) =>
          word.length >= 8
            ? partialEditDistance(word, candidate)
            : candidate.startsWith(word.slice(0, 3))
              ? editDistance(word, candidate)
              : Infinity,
        ),
      );
      if (distance > (word.length >= 10 ? 2 : 1)) {
        total = Infinity;
        break;
      }
      total += distance;
    }
    if (total !== Infinity) found.push({ family: entry.family, distance: total });
  }
  return found.sort((a, b) => a.distance - b.distance).map((entry) => entry.family);
}

/** A family's label in the given UI language. */
export function familyLabel(family: RoleFamily, lang: Lang): string {
  return lang === 'de' ? family.labelDe : family.label;
}

/** Most frequent distinct `standardizedTitle` values in `records`, for the "includes X, Y, Z" hint. */
export function familyExampleTitles(records: readonly SalaryRecord[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const title = record.standardizedTitle.trim();
    if (title) counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'))
    .slice(0, limit)
    .map(([title]) => title);
}

/** Every family with at least one matching record, most records first, labelled in `lang`, for the role autocomplete. */
export function roleFamilySuggestions(
  families: readonly RoleFamily[],
  records: readonly SalaryRecord[],
  lang: Lang,
): RoleFamilySuggestion[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.roleFamily) counts.set(record.roleFamily, (counts.get(record.roleFamily) ?? 0) + 1);
  }
  return families
    .map((family) => ({ family, label: familyLabel(family, lang), count: counts.get(family.id) ?? 0 }))
    .filter((suggestion) => suggestion.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, lang));
}
