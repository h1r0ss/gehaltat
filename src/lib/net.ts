// Approximate Austrian gross -> net for 2026: an employee paid 14 times a
// year, no Familienbonus Plus, Pendlerpauschale or other allowances. Pure,
// erasable TS (no enums/namespaces), imported by Node tests and the UI.
//
// This is deliberately a simplification of real Austrian payroll (which also
// depends on Familienbonus, church tax, works council fees, etc.). Wherever
// it is shown in the UI it is marked "≈ approximate".

/** Employee social insurance, regular month. */
export const SI_RATE_REGULAR = 0.1807;
/** Contribution ceiling (Höchstbeitragsgrundlage), EUR per regular month. */
export const SI_CEILING_REGULAR = 6930;

/** Employee social insurance, 13th/14th payment combined. */
export const SI_RATE_SPECIAL = 0.1707;
/** Contribution ceiling for the combined 13th/14th payment, EUR per year. */
export const SI_CEILING_SPECIAL = 13860;

/** Flat tax rate on the 13th/14th payment above the free amount. */
export const SPECIAL_TAX_RATE = 0.06;
/** Tax-free allowance on the 13th/14th payment, EUR per year. */
export const SPECIAL_ALLOWANCE = 620;

/** Transport tax credit (Verkehrsabsetzbetrag), EUR per year. */
export const TRANSPORT_CREDIT = 496;

export type TaxBracket = { upTo: number; rate: number };

/** Annual wage tax brackets applied to (gross - SI) x 12. Marginal, cumulative. */
export const TAX_BRACKETS: readonly TaxBracket[] = [
  { upTo: 13_539, rate: 0 },
  { upTo: 21_992, rate: 0.2 },
  { upTo: 36_458, rate: 0.3 },
  { upTo: 70_365, rate: 0.4 },
  { upTo: 104_859, rate: 0.48 },
  { upTo: 1_000_000, rate: 0.5 },
  { upTo: Infinity, rate: 0.55 },
];

/** Progressive tax on an annual taxable base, applying each bracket's rate only to its own slice. */
function progressiveTax(base: number): number {
  if (!(base > 0)) return 0;
  let tax = 0;
  let previous = 0;
  for (const bracket of TAX_BRACKETS) {
    if (base <= previous) break;
    const slice = Math.min(base, bracket.upTo) - previous;
    if (slice > 0) tax += slice * bracket.rate;
    previous = bracket.upTo;
  }
  return tax;
}

/** Net of one regular monthly payment (the 13th/14th are handled separately). */
export function netMonthly(grossMonthly: number): number {
  if (!Number.isFinite(grossMonthly) || grossMonthly <= 0) return 0;
  const si = SI_RATE_REGULAR * Math.min(grossMonthly, SI_CEILING_REGULAR);
  const annualTaxable = (grossMonthly - si) * 12;
  const annualTax = Math.max(0, progressiveTax(annualTaxable) - TRANSPORT_CREDIT);
  return grossMonthly - si - annualTax / 12;
}

/** Net of the combined 13th + 14th payment (2 x monthly gross), for one year. */
export function netSpecialPayments(grossMonthly: number): number {
  if (!Number.isFinite(grossMonthly) || grossMonthly <= 0) return 0;
  const specialGross = 2 * grossMonthly;
  const si = SI_RATE_SPECIAL * Math.min(specialGross, SI_CEILING_SPECIAL);
  const taxable = Math.max(0, specialGross - si - SPECIAL_ALLOWANCE);
  const tax = SPECIAL_TAX_RATE * taxable;
  return specialGross - si - tax;
}

/** Annual net: 12 regular monthly payments plus the 13th/14th combined. */
export function netAnnual(grossMonthly: number): number {
  if (!Number.isFinite(grossMonthly) || grossMonthly <= 0) return 0;
  return 12 * netMonthly(grossMonthly) + netSpecialPayments(grossMonthly);
}

/** Upper bound for the bisection: comfortably above any realistic salary. */
const MAX_GROSS_MONTHLY = 2_000_000;
const BISECTION_STEPS = 60;

/** Inverts a monotonically increasing gross -> net function by bisection. */
function invert(netOf: (gross: number) => number, targetNet: number): number {
  if (!Number.isFinite(targetNet) || targetNet <= 0) return 0;
  let lo = 0;
  let hi = MAX_GROSS_MONTHLY;
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const mid = (lo + hi) / 2;
    if (netOf(mid) < targetNet) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Gross monthly (14-payment equivalent) that yields the given regular monthly net. */
export function grossFromNetMonthly(targetNetMonthly: number): number {
  return invert(netMonthly, targetNetMonthly);
}

/** Gross monthly (14-payment equivalent) that yields the given annual net (12 payments + 13th/14th). */
export function grossFromNetAnnual(targetNetAnnual: number): number {
  return invert(netAnnual, targetNetAnnual);
}

/** Short, reusable disclaimer for wherever an approximate net figure is shown. */
export const NET_APPROX_HINT =
  'Approximate for 2026: employee with 14 payments a year, no Familienbonus Plus, Pendlerpauschale or other allowances. Actual net pay depends on personal circumstances.';
