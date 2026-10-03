// Reads every money-like number out of free text so an extracted figure can be checked
// against its source. Handles German and English separators, space/apostrophe grouping,
// the "k" suffix (60k, 4,2k) and common OCR letter/digit confusions. Deliberately permissive:
// ambiguous tokens such as "3.450" yield both readings (3450 and 3.45).

const GROUP_SEPARATORS = /[ '  ]/g;

export function extractAmounts(text) {
  const source = fixOcrDigits(String(text ?? ''));
  const amounts = new Set();

  for (const match of source.matchAll(/(?<![\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s?[kK](?![a-zA-Z])/g)) {
    add(amounts, decimal(match[1]) * 1000);
  }
  for (const match of source.matchAll(/(?<![\d.,])\d{1,3}(?:[ '  ]\d{3})+(?:[.,]\d{1,2})?(?!\d)/g)) {
    for (const value of interpret(match[0].replace(GROUP_SEPARATORS, ''))) add(amounts, value);
  }
  for (const match of source.matchAll(/\d+(?:[.,]\d+)*/g)) {
    for (const value of interpret(match[0])) add(amounts, value);
  }
  return amounts;
}

// Small values (hourly wages, hours) must match to the cent; salaries tolerate rounding.
export function hasAmount(amounts, value) {
  const tolerance = value < 100 ? 0.051 : Math.max(1, value * 0.005);
  for (const amount of amounts) {
    if (Math.abs(amount - value) <= tolerance) return true;
  }
  return false;
}

function fixOcrDigits(text) {
  return text.replace(/(?<=\d[.,]?)[oO]|[oO](?=[.,]?\d)/g, '0').replace(/(?<=\d[.,]?)[lI|]|[lI|](?=[.,]?\d)/g, '1');
}

function interpret(token) {
  const value = token.replace(/[.,]+$/, '');
  if (!value) return [];
  const hasDot = value.includes('.');
  const hasComma = value.includes(',');

  if (hasDot && hasComma) {
    const decimalSeparator = value.lastIndexOf('.') > value.lastIndexOf(',') ? '.' : ',';
    const groupSeparator = decimalSeparator === '.' ? ',' : '.';
    return [Number(value.split(groupSeparator).join('').replace(decimalSeparator, '.'))].filter(Number.isFinite);
  }
  if (!hasDot && !hasComma) return [Number(value)];

  const parts = value.split(hasDot ? '.' : ',');
  const readings = [];
  const grouped = parts[0].length <= 3 && parts.slice(1).every((part) => part.length === 3);
  if (grouped || parts.length > 2) readings.push(Number(parts.join('')));
  if (parts.length === 2) readings.push(Number(`${parts[0]}.${parts[1]}`));
  return readings.filter(Number.isFinite);
}

function decimal(token) {
  return Number(token.replace(',', '.'));
}

function add(set, value) {
  if (Number.isFinite(value) && value > 0) set.add(Math.round(value * 100) / 100);
}
