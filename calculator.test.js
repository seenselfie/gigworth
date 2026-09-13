const assert = require('node:assert/strict');
const test = require('node:test');
const { calculate } = require('./script.js');
const normal = { income: 100000, hours: 40, weeksOff: 4, taxRate: 30, expenses: 8000, billable: 70, buffer: 15 };
const invalid = (changes, field) => { const result = calculate({ ...normal, ...changes }); assert.equal(result.ok, false); assert.ok(result.issues[field]); };

test('calculates a realistic freelance rate safely', () => { const result = calculate(normal); assert.equal(result.ok, true); assert.equal(result.state, 'ready'); assert.equal(result.billableHours, 1344); assert.ok(result.minimumRate > 112 && result.minimumRate < 113); assert.ok(result.recommendedRate > result.minimumRate); });
test('uses a friendly zero-target state', () => { const result = calculate({ ...normal, income: 0, expenses: 0 }); assert.equal(result.ok, true); assert.equal(result.state, 'empty'); });
test('handles small valid targets without forcing a minimum rate', () => { const result = calculate({ ...normal, income: 0.01, expenses: 0 }); assert.equal(result.ok, true); assert.ok(result.recommendedRate > 0 && result.recommendedRate < 1); assert.ok(result.warnings.length > 0); });
test('rejects every divide-by-zero path', () => { invalid({ hours: 0 }, 'hours'); invalid({ weeksOff: 52 }, 'weeksOff'); invalid({ taxRate: 100 }, 'taxRate'); invalid({ billable: 0 }, 'billable'); });
test('rejects negative, blank, and impossible values', () => { invalid({ income: -1 }, 'income'); invalid({ expenses: -1 }, 'expenses'); invalid({ weeksOff: 53 }, 'weeksOff'); invalid({ billable: 101 }, 'billable'); invalid({ taxRate: -1 }, 'taxRate'); invalid({ income: '' }, 'income'); invalid({ hours: 1000 }, 'hours'); });
test('keeps expense-only and extreme-but-safe calculations finite', () => { const expenseOnly = calculate({ ...normal, income: 0, expenses: 10000 }); assert.equal(expenseOnly.ok, true); assert.ok(Number.isFinite(expenseOnly.recommendedRate)); const large = calculate({ ...normal, income: 1000000000000, expenses: 1000000000000 }); assert.equal(large.ok, true); assert.ok(Number.isFinite(large.monthlyRevenue)); });

test('audits requested valid boundary combinations without NaN or Infinity', () => {
  const cases = [
    { income: 0, expenses: 10000 },
    { income: 0.01, expenses: 0 },
    { income: 1, expenses: 0 },
    { income: 10, expenses: 0 },
    { income: 100, expenses: 0 },
    { income: 10, taxRate: 30 },
    { income: 10, hours: 0.1 },
    { income: 100, taxRate: 99 },
    { income: 100000, weeksOff: 0, taxRate: 0, billable: 100 },
    { income: 100000, hours: 1, weeksOff: 51, billable: 1 },
    { income: 100.25, expenses: 0.5, taxRate: 0.01 }
  ];
  cases.forEach((changes) => {
    const result = calculate({ ...normal, ...changes });
    assert.equal(result.ok, true, JSON.stringify(changes));
    if (result.state === 'ready') [result.billableHours, result.minimumRate, result.recommendedRate, result.monthlyRevenue].forEach((value) => assert.ok(Number.isFinite(value) && value >= 0));
  });
});

test('audits requested invalid combinations with a specific safe failure', () => {
  const cases = [
    [{ income: -1, hours: -1, weeksOff: -1, taxRate: -1, expenses: -1, billable: -1 }, 'income'],
    [{ income: '', hours: '', weeksOff: '', taxRate: '', expenses: '', billable: '', buffer: '' }, 'income'],
    [{ income: 'not-a-number' }, 'income'],
    [{ hours: 0 }, 'hours'],
    [{ hours: 1000 }, 'hours'],
    [{ weeksOff: 52 }, 'weeksOff'],
    [{ weeksOff: 53 }, 'weeksOff'],
    [{ taxRate: 100 }, 'taxRate'],
    [{ taxRate: 101 }, 'taxRate'],
    [{ billable: 0 }, 'billable'],
    [{ billable: 101 }, 'billable'],
    [{ income: 1e100, expenses: 1e100, hours: 1000 }, 'income']
  ];
  cases.forEach(([changes, field]) => invalid(changes, field));
});
