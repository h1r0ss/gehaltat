// Salary calculator: turns the visitor's own figure (gross/net, per month or
// per year) into the regular-monthly, 14x/year gross figure the benchmark is
// measured in (see stats.ts basisValue), so it can be compared like for like.
// Pure functions, imported by Node tests. The visitor's figure is never
// written to the URL (see App.tsx / urlState.ts).
import { grossFromNetAnnual, grossFromNetMonthly } from './net.ts';

export type SalaryBasisInput = 'gross' | 'net';
export type SalaryFrequency = 'month' | 'year';

export type SalaryInput = {
  amount: number | null;
  basis: SalaryBasisInput;
  frequency: SalaryFrequency;
};

export const DEFAULT_SALARY_INPUT: SalaryInput = { amount: null, basis: 'gross', frequency: 'month' };

/**
 * The visitor's figure converted to a regular-monthly (14x/year) gross
 * amount, comparable with the benchmark's `grossMonthly` basis. `null` when
 * no valid amount was entered. A yearly figure includes the 13th/14th
 * payment: gross per year is ÷ 14; net per year is inverted with the annual
 * net rule, because the 13th/14th are taxed far lower than a regular month
 * (dividing it by 14 first would overstate the gross).
 */
export function resolveGrossMonthly(input: SalaryInput): number | null {
  const amount = input.amount;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  if (input.basis === 'net') return input.frequency === 'year' ? grossFromNetAnnual(amount) : grossFromNetMonthly(amount);
  return input.frequency === 'year' ? amount / 14 : amount;
}

/** True when the entered figure required a net→gross conversion, so the UI can explain it. */
export function wasConverted(input: SalaryInput): boolean {
  return input.basis === 'net' && resolveGrossMonthly(input) !== null;
}
