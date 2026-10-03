import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SALARY_INPUT, resolveGrossMonthly, wasConverted } from '../src/lib/calculator.ts';
import type { SalaryInput } from '../src/lib/calculator.ts';
import { grossFromNetMonthly, netAnnual, netMonthly } from '../src/lib/net.ts';

function input(overrides: Partial<SalaryInput>): SalaryInput {
  return { ...DEFAULT_SALARY_INPUT, ...overrides };
}

describe('resolveGrossMonthly', () => {
  test('no amount entered is null', () => {
    assert.equal(resolveGrossMonthly(DEFAULT_SALARY_INPUT), null);
    assert.equal(resolveGrossMonthly(input({ amount: 0 })), null);
    assert.equal(resolveGrossMonthly(input({ amount: -100 })), null);
    assert.equal(resolveGrossMonthly(input({ amount: NaN })), null);
  });

  test('gross per month passes through unchanged', () => {
    assert.equal(resolveGrossMonthly(input({ amount: 4000, basis: 'gross', frequency: 'month' })), 4000);
  });

  test('gross per year divides by 14 (14-payment convention, matching the rest of the app)', () => {
    assert.equal(resolveGrossMonthly(input({ amount: 56000, basis: 'gross', frequency: 'year' })), 4000);
  });

  test('net per month is converted to gross via net.ts', () => {
    const grossMonthly = 4000;
    const net = netMonthly(grossMonthly);
    const resolved = resolveGrossMonthly(input({ amount: net, basis: 'net', frequency: 'month' }));
    assert.ok(resolved !== null);
    assert.ok(Math.abs(resolved - grossMonthly) < 0.5);
  });

  test('net per year is inverted with the annual net rule (13th/14th taxed lower), not ÷ 14', () => {
    const grossMonthly = 4286;
    const resolved = resolveGrossMonthly(input({ amount: netAnnual(grossMonthly), basis: 'net', frequency: 'year' }));
    assert.ok(resolved !== null);
    assert.ok(Math.abs(resolved - grossMonthly) < 0.5, `expected ≈${grossMonthly}, got ${resolved}`);
    const naive = grossFromNetMonthly(netAnnual(grossMonthly) / 14);
    assert.ok(naive > grossMonthly + 100, 'the old ÷ 14 shortcut overstated the gross');
  });
});

describe('wasConverted', () => {
  test('true only for a valid net entry', () => {
    assert.equal(wasConverted(input({ amount: 2500, basis: 'net' })), true);
    assert.equal(wasConverted(input({ amount: 2500, basis: 'gross' })), false);
    assert.equal(wasConverted(input({ amount: null, basis: 'net' })), false);
    assert.equal(wasConverted(input({ amount: -5, basis: 'net' })), false);
  });
});
