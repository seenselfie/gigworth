const CalculatorCore = (() => {
  const limits = { income: 1000000000000, expenses: 1000000000000, hours: 168, weeksOff: 52, taxRate: 100, billable: 100, buffer: 100 };
  const numericValue = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  function validate(rawValues) {
    const values = Object.fromEntries(Object.entries(rawValues).map(([key, value]) => [key, numericValue(value)]));
    const issues = {};
    const required = { income: 'Enter a desired annual take-home income.', hours: 'Enter your working hours per week.', weeksOff: 'Enter your weeks off per year.', taxRate: 'Enter an estimated tax rate.', expenses: 'Enter annual business expenses (use 0 if none).', billable: 'Enter a billable-hours percentage.', buffer: 'Enter a resilience-buffer percentage.' };
    Object.entries(required).forEach(([key, message]) => { if (values[key] === null) issues[key] = message; });
    if (Object.keys(issues).length) return { ok: false, values, issues };
    if (values.income < 0) issues.income = 'Desired annual take-home income cannot be negative.';
    else if (values.income > limits.income) issues.income = 'Enter a take-home income below $1 trillion.';
    if (values.hours <= 0) issues.hours = 'Enter working hours per week greater than 0.';
    else if (values.hours > limits.hours) issues.hours = 'Working hours per week cannot be greater than 168.';
    if (values.weeksOff < 0) issues.weeksOff = 'Weeks off per year cannot be negative.';
    else if (values.weeksOff >= limits.weeksOff) issues.weeksOff = 'Enter fewer than 52 weeks off so you have working weeks remaining.';
    if (values.taxRate < 0 || values.taxRate > limits.taxRate) issues.taxRate = 'Tax rate must be between 0% and 100%.';
    else if (values.taxRate === 100) issues.taxRate = 'A 100% tax rate cannot produce take-home income. Enter a rate below 100%.';
    if (values.expenses < 0) issues.expenses = 'Annual business expenses cannot be negative.';
    else if (values.expenses > limits.expenses) issues.expenses = 'Enter annual business expenses below $1 trillion.';
    if (values.billable <= 0) issues.billable = 'Enter a billable percentage greater than 0% so you have billable capacity.';
    else if (values.billable > limits.billable) issues.billable = 'Billable working hours must be between 0% and 100%.';
    if (values.buffer < 0 || values.buffer > limits.buffer) issues.buffer = 'Resilience buffer must be between 0% and 100%.';
    return { ok: Object.keys(issues).length === 0, values, issues };
  }

  function calculate(rawValues) {
    const validation = validate(rawValues);
    if (!validation.ok) return { ...validation, state: 'invalid' };
    const { income, hours, weeksOff, taxRate, expenses, billable, buffer } = validation.values;
    if (income === 0 && expenses === 0) return { ok: true, values: validation.values, state: 'empty', warnings: [] };
    const workingWeeks = 52 - weeksOff;
    const billableHours = hours * workingWeeks * (billable / 100);
    const taxMultiplier = 1 - (taxRate / 100);
    if (!Number.isFinite(billableHours) || billableHours <= 0) return { ok: false, values: validation.values, state: 'invalid', issues: { billable: 'Enter working hours and billable capacity that produce more than 0 billable hours a year.' } };
    if (!Number.isFinite(taxMultiplier) || taxMultiplier <= 0) return { ok: false, values: validation.values, state: 'invalid', issues: { taxRate: 'Enter a tax rate below 100%.' } };
    // Expenses are deductible, so estimated tax is calculated on profit (revenue minus expenses).
    const incomeGrossedUp = income / taxMultiplier;
    const revenueNeeded = incomeGrossedUp + expenses;
    const minimumRate = revenueNeeded / billableHours;
    const recommendedRate = minimumRate * (1 + buffer / 100);
    const monthlyRevenue = (revenueNeeded * (1 + buffer / 100)) / 12;
    const resultValues = { workingWeeks, billableHours, incomeGrossedUp, revenueNeeded, minimumRate, recommendedRate, monthlyRevenue };
    if (!Object.values(resultValues).every(Number.isFinite) || Object.values(resultValues).some((value) => value < 0)) return { ok: false, values: validation.values, state: 'invalid', issues: { income: 'These inputs are too large to calculate safely. Use smaller values and try again.' } };
    const warnings = [];
    if (recommendedRate > 0 && recommendedRate < 1) warnings.push('These inputs produce an unusually low rate. The calculation is accurate, but double-check your income target and available billable time.');
    if (income === 0 && expenses > 0) warnings.push('This rate covers business expenses only because your take-home income target is $0.');
    if (hours < 1) warnings.push('Your weekly working time is under one hour, so even small changes can move this estimate sharply.');
    return { ok: true, values: validation.values, state: 'ready', warnings, ...resultValues };
  }
  return { calculate, validate };
})();

if (typeof module !== 'undefined') module.exports = CalculatorCore;

if (typeof document !== 'undefined') {
  const fields = { income: document.querySelector('#income'), hours: document.querySelector('#hours'), weeksOff: document.querySelector('#weeks-off'), taxRate: document.querySelector('#tax-rate'), expenses: document.querySelector('#expenses'), billable: document.querySelector('#billable'), buffer: document.querySelector('#buffer') };
  const defaults = { income: 85000, hours: 40, weeksOff: 4, taxRate: 30, expenses: 8000, billable: 65, buffer: 15 };
  const output = (id) => document.querySelector(id);
  function formatCurrency(value, rate = false) {
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value > 0 && value < 1) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 6 }).format(value);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: rate ? 2 : 0, maximumFractionDigits: 2 }).format(value);
  }
  const formatNumber = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  const rawValues = () => Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
  function clearResults(message) {
    output('#billable-hours').textContent = '—';
    output('#minimum-rate').textContent = '—';
    output('#recommended-rate').textContent = '—';
    output('#monthly-revenue').textContent = '—';
    output('#income-gross-up').textContent = '—';
    output('#expense-total').textContent = '—';
    output('#revenue-needed').textContent = '—';
    output('#formula-hours').textContent = '—';
    output('#formula-rate').textContent = '—';
    const warning = output('#result-warning');
    warning.hidden = false;
    warning.textContent = message;
  }
  function renderIssues(issues) {
    const error = output('#form-error');
    const messages = Object.values(issues);
    Object.entries(fields).forEach(([key, field]) => field.toggleAttribute('aria-invalid', Boolean(issues[key])));
    error.hidden = false; error.textContent = messages.join(' ');
    clearResults(messages[0]);
  }
  function render(result) {
    if (!result.ok) { renderIssues(result.issues); return; }
    Object.values(fields).forEach((field) => field.removeAttribute('aria-invalid'));
    output('#form-error').hidden = true;
    if (result.state === 'empty') { clearResults('Enter a take-home income or business expense target to see a meaningful hourly rate.'); return; }
    output('#billable-value').textContent = `${result.values.billable}%`; output('#buffer-value').textContent = `${result.values.buffer}%`; output('#buffer-note').textContent = `${result.values.buffer}%`;
    output('#billable-hours').textContent = formatNumber(result.billableHours);
    output('#minimum-rate').textContent = `${formatCurrency(result.minimumRate, true)}/hr`; output('#recommended-rate').textContent = formatCurrency(result.recommendedRate, true); output('#monthly-revenue').textContent = formatCurrency(result.monthlyRevenue);
    output('#income-gross-up').textContent = formatCurrency(result.incomeGrossedUp); output('#expense-total').textContent = formatCurrency(result.values.expenses); output('#revenue-needed').textContent = formatCurrency(result.revenueNeeded); output('#formula-hours').textContent = `${formatNumber(result.billableHours)} hrs`; output('#formula-rate').textContent = `${formatCurrency(result.minimumRate, true)}/hr`;
    const warning = output('#result-warning'); warning.hidden = result.warnings.length === 0; warning.textContent = result.warnings.join(' ');
  }
  function update() { render(CalculatorCore.calculate(rawValues())); }
  Object.values(fields).forEach((field) => field.addEventListener('input', update));
  output('#reset').addEventListener('click', () => { Object.entries(defaults).forEach(([key, value]) => { fields[key].value = value; }); update(); });
  update();
}
