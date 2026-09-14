const assert = require('node:assert/strict');
const test = require('node:test');
const { calculate, createAnalyticsTracker } = require('./script.js');
const base = { payment: 1000, mainHours: 10, adminHours: 2, revisionHours: 3, feeRate: 3, expenses: 50, taxRate: 25, targetRate: 40 };
const invalid = (changes, field) => { const result = calculate({ ...base, ...changes }); assert.equal(result.ok, false); assert.ok(result.issues[field]); };

test('calculates a normal project', () => { const result = calculate(base); assert.equal(result.ok, true); assert.equal(result.totalHours, 15); assert.equal(result.feeDollars, 30); assert.equal(result.takeHome, 690); assert.equal(result.effectiveRate, 46); assert.equal(result.requiredPayment, 876.2886597938144); });
test('handles zero payment without broken values', () => { const result = calculate({ ...base, payment: 0 }); assert.equal(result.ok, true); assert.equal(result.takeHome, -50); assert.equal(result.effectiveRate, -50 / 15); });
test('rejects zero total hours', () => invalid({ mainHours: 0, adminHours: 0, revisionHours: 0 }, 'mainHours'));
test('supports zero and 100 percent platform fees', () => { assert.equal(calculate({ ...base, feeRate: 0 }).feeDollars, 0); const result = calculate({ ...base, feeRate: 100 }); assert.equal(result.ok, true); assert.equal(result.takeHome, -50); assert.equal(result.requiredPayment, null); });
test('supports zero and 100 percent tax', () => { assert.equal(calculate({ ...base, taxRate: 0 }).taxDollars, 0); const result = calculate({ ...base, taxRate: 100 }); assert.equal(result.takeHome, 0); assert.equal(result.requiredPayment, null); });
test('keeps expense-heavy and tiny projects mathematically accurate', () => { const expenseHeavy = calculate({ ...base, expenses: 2000 }); assert.equal(expenseHeavy.takeHome, -1030); const tiny = calculate({ ...base, payment: 1, expenses: 0 }); assert.equal(tiny.ok, true); assert.ok(Number.isFinite(tiny.effectiveRate)); });
test('reverse calculation reaches the requested hourly target', () => { const seed = calculate(base); const quoted = calculate({ ...base, payment: seed.requiredPayment }); assert.ok(Math.abs(quoted.effectiveRate - base.targetRate) < 1e-9); });
test('scope creep scenarios use 10, 25, and 50 percent more time', () => { const result = calculate(base); assert.deepEqual(result.scenarios.map(({ percent }) => percent), [10, 25, 50]); assert.ok(Math.abs(result.scenarios[0].rate - 46 / 1.1) < 1e-10); assert.ok(Math.abs(result.scenarios[1].rate - 46 / 1.25) < 1e-10); assert.ok(Math.abs(result.scenarios[2].rate - 46 / 1.5) < 1e-10); });
test('rejects negative, blank, out-of-range, and non-numeric inputs', () => { invalid({ payment: -1 }, 'payment'); invalid({ mainHours: -1 }, 'mainHours'); invalid({ feeRate: 101 }, 'feeRate'); invalid({ taxRate: 101 }, 'taxRate'); invalid({ expenses: '' }, 'expenses'); invalid({ payment: 'nope' }, 'payment'); });
test('target rate of zero safely omits comparison and reverse quote', () => { const result = calculate({ ...base, targetRate: 0 }); assert.equal(result.ok, true); assert.equal(result.comparison, null); assert.equal(result.requiredPayment, null); });
test('rejects an unrepresentably tiny target comparison safely', () => invalid({ targetRate: 5e-324 }, 'targetRate'));
test('loss-making projects stay loss-making as hours grow and target shortfall worsens', () => {
  const tenHours = calculate({ ...base, payment: 100, mainHours: 10, adminHours: 0, revisionHours: 0, feeRate: 0, expenses: 200, taxRate: 25, targetRate: 40 });
  const twentyHours = calculate({ ...base, payment: 100, mainHours: 20, adminHours: 0, revisionHours: 0, feeRate: 0, expenses: 200, taxRate: 25, targetRate: 40 });
  assert.equal(tenHours.takeHome, -100); assert.equal(twentyHours.takeHome, -100);
  assert.equal(tenHours.verdict.title, 'Project loses money'); assert.equal(twentyHours.verdict.title, 'Project loses money');
  assert.ok(twentyHours.difference < tenHours.difference);
});
test('more revision time lowers a profitable effective rate and raises required price', () => {
  const shortScope = calculate({ ...base, revisionHours: 1 });
  const longScope = calculate({ ...base, revisionHours: 8 });
  assert.ok(longScope.effectiveRate < shortScope.effectiveRate);
  assert.ok(longScope.requiredPayment > shortScope.requiredPayment);
});
test('loss scenarios become progressively worse against the target', () => {
  const result = calculate({ ...base, payment: 100, mainHours: 10, adminHours: 0, revisionHours: 0, feeRate: 0, expenses: 200, targetRate: 40 });
  assert.equal(result.verdict.title, 'Project loses money');
  assert.ok(result.scenarios[1].shortfall < result.scenarios[0].shortfall);
  assert.ok(result.scenarios[2].shortfall < result.scenarios[1].shortfall);
});
test('loss scenarios with a zero target retain total loss without a comparison division', () => {
  const result = calculate({ ...base, payment: 100, mainHours: 10, adminHours: 0, revisionHours: 0, feeRate: 0, expenses: 200, targetRate: 0 });
  assert.equal(result.takeHome, -100); assert.equal(result.comparison, null);
  result.scenarios.forEach((scenario) => { assert.equal(scenario.shortfall, -100); assert.ok(Number.isFinite(scenario.hours)); });
});
test('analytics only emits meaningful result transitions after the calculator starts', () => {
  const events = [];
  const tracker = createAnalyticsTracker((name, parameters) => events.push({ name, parameters }));
  const profitable = calculate(base);
  const loss = calculate({ ...base, payment: 100, expenses: 200 });
  tracker.prime(profitable); tracker.result(profitable);
  assert.equal(events.length, 0);
  tracker.start(); tracker.start();
  tracker.result(profitable); tracker.result(profitable);
  tracker.result(loss); tracker.result(loss);
  tracker.result(profitable);
  const names = events.map(({ name }) => name);
  assert.deepEqual(names, ['gigworth_started', 'gigworth_project_loss', 'gigworth_project_profitable', 'gigworth_target_met']);
  assert.equal(events[1].parameters.result_state, 'loss');
  assert.equal(events[2].parameters.result_state, 'profitable');
});
test('analytics records every reset without requiring an available gtag function', () => {
  const events = [];
  const tracker = createAnalyticsTracker((name, parameters) => events.push({ name, parameters }));
  tracker.reset(); tracker.reset();
  assert.deepEqual(events.map(({ name }) => name), ['gigworth_reset', 'gigworth_reset']);
});
