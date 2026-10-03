import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { grossFromNetAnnual, grossFromNetMonthly, netAnnual, netMonthly, netSpecialPayments } from '../src/lib/net.ts';

function assertClose(actual: number, expected: number, tolerance: number, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

describe('netMonthly', () => {
  test('matches reference values within 3 EUR', () => {
    assertClose(netMonthly(3000), 2171, 3);
    assertClose(netMonthly(5000), 3212, 3);
    assertClose(netMonthly(8000), 4732, 3);
  });

  test('is zero for zero, negative or non-finite gross', () => {
    assert.equal(netMonthly(0), 0);
    assert.equal(netMonthly(-100), 0);
    assert.equal(netMonthly(NaN), 0);
  });

  test('rises monotonically with gross', () => {
    const steps = [500, 1000, 1500, 2000, 3000, 4000, 5000, 6930, 7000, 8000, 10000, 15000, 25000];
    for (let i = 1; i < steps.length; i += 1) {
      assert.ok(
        netMonthly(steps[i]) > netMonthly(steps[i - 1]),
        `netMonthly(${steps[i]}) should exceed netMonthly(${steps[i - 1]})`,
      );
    }
  });

  test('SI is capped at the contribution ceiling, so net keeps rising above it', () => {
    // Above the ceiling, take-home pay grows almost 1:1 with gross before tax,
    // so the marginal gain from 8000 to 9000 must be positive and sizeable.
    const delta = netMonthly(9000) - netMonthly(8000);
    assert.ok(delta > 300, `expected a sizeable marginal gain above the SI ceiling, got ${delta}`);
  });
});

describe('netSpecialPayments and netAnnual', () => {
  test('special payment net is less than its gross (SI and tax apply)', () => {
    const gross = 3000;
    const specialNet = netSpecialPayments(gross);
    assert.ok(specialNet > 0 && specialNet < 2 * gross);
  });

  test('annual net equals 12 regular months plus the special payment net', () => {
    const gross = 4200;
    const expected = 12 * netMonthly(gross) + netSpecialPayments(gross);
    assertClose(netAnnual(gross), expected, 1e-9);
  });

  test('rises monotonically with gross', () => {
    assert.ok(netAnnual(5000) > netAnnual(3000));
    assert.ok(netAnnual(8000) > netAnnual(5000));
  });
});

describe('inverting net back to gross', () => {
  test('grossFromNetMonthly round-trips through netMonthly', () => {
    for (const gross of [1500, 2600, 3000, 4173, 5000, 8000, 12000]) {
      const net = netMonthly(gross);
      const inverted = grossFromNetMonthly(net);
      assertClose(inverted, gross, 0.5, `round-trip failed for gross=${gross}`);
    }
  });

  test('grossFromNetAnnual round-trips through netAnnual', () => {
    for (const gross of [1500, 2600, 3000, 4173, 5000, 8000, 12000]) {
      const net = netAnnual(gross);
      const inverted = grossFromNetAnnual(net);
      assertClose(inverted, gross, 0.5, `round-trip failed for gross=${gross}`);
    }
  });

  test('is zero for zero, negative or non-finite net', () => {
    assert.equal(grossFromNetMonthly(0), 0);
    assert.equal(grossFromNetMonthly(-5), 0);
    assert.equal(grossFromNetAnnual(NaN), 0);
  });
});
