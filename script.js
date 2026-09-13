const GigWorthCore = (() => {
  const MAX_MONEY = 1e12;
  const MAX_HOURS = 1000000;
  const toNumber = (value) => (value === null || value === undefined || String(value).trim() === '' ? null : Number(value));

  function validate(raw) {
    const values = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, toNumber(value)]));
    const issues = {};
    const required = { payment: 'Enter the project payment.', mainHours: 'Enter main work hours (use 0 if none).', adminHours: 'Enter meetings or admin hours (use 0 if none).', revisionHours: 'Enter expected revision hours (use 0 if none).', feeRate: 'Enter a platform or payment fee (use 0 if none).', expenses: 'Enter project-specific expenses (use 0 if none).', taxRate: 'Enter an estimated tax rate (use 0 if none).', targetRate: 'Enter your target hourly rate (use 0 if you only want the actual rate).' };
    Object.entries(required).forEach(([key, message]) => { if (!Number.isFinite(values[key])) issues[key] = message; });
    if (Object.keys(issues).length) return { ok: false, values, issues };
    ['payment', 'mainHours', 'adminHours', 'revisionHours', 'expenses', 'targetRate'].forEach((key) => {
      if (values[key] < 0) issues[key] = `${key === 'payment' ? 'Project payment' : key.replace(/([A-Z])/g, ' $1').toLowerCase()} cannot be negative.`;
      else if (values[key] > (key.includes('Hours') ? MAX_HOURS : MAX_MONEY)) issues[key] = `Enter a smaller ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} to calculate safely.`;
    });
    ['feeRate', 'taxRate'].forEach((key) => { if (values[key] < 0 || values[key] > 100) issues[key] = `${key === 'feeRate' ? 'Platform / payment fee' : 'Estimated tax rate'} must be between 0% and 100%.`; });
    return { ok: Object.keys(issues).length === 0, values, issues };
  }

  function calculate(raw) {
    const checked = validate(raw);
    if (!checked.ok) return { ...checked, state: 'invalid' };
    const { payment, mainHours, adminHours, revisionHours, feeRate, expenses, taxRate, targetRate } = checked.values;
    const totalHours = mainHours + adminHours + revisionHours;
    if (!Number.isFinite(totalHours) || totalHours <= 0) return { ok: false, state: 'invalid', values: checked.values, issues: { mainHours: 'Enter at least some project time so GigWorth can calculate an hourly rate.' } };
    const feeDollars = payment * (feeRate / 100);
    const revenueAfterFee = payment - feeDollars;
    const profitBeforeTax = revenueAfterFee - expenses;
    const taxDollars = Math.max(profitBeforeTax, 0) * (taxRate / 100);
    const takeHome = profitBeforeTax - taxDollars;
    const effectiveRate = takeHome / totalHours;
    const targetEarnings = targetRate * totalHours;
    const difference = takeHome - targetEarnings;
    const comparison = targetRate > 0 ? effectiveRate / targetRate : null;
    const scenarios = [10, 25, 50].map((percent) => {
      const hours = totalHours * (1 + percent / 100);
      const targetEarnings = targetRate * hours;
      return { percent, hours, rate: takeHome / hours, targetEarnings, shortfall: takeHome - targetEarnings };
    });
    const calculationValues = { totalHours, feeDollars, revenueAfterFee, profitBeforeTax, taxDollars, takeHome, effectiveRate, targetEarnings, difference, ...Object.fromEntries(scenarios.map((item) => [`scenario${item.percent}`, item.rate])) };
    if (!Object.values(calculationValues).every(Number.isFinite)) return { ok: false, state: 'invalid', values: checked.values, issues: { payment: 'These inputs are too large to calculate safely. Use smaller values and try again.' } };
    if (comparison !== null && !Number.isFinite(comparison)) return { ok: false, state: 'invalid', values: checked.values, issues: { targetRate: 'Your target rate is too small to compare safely. Enter a larger value or use 0 to skip the comparison.' } };

    let requiredPayment = null;
    let requiredPaymentNote = '';
    if (targetRate === 0) {
      requiredPaymentNote = 'Set a target hourly rate to calculate the project price needed to reach it.';
    } else if (feeRate === 100) {
      requiredPaymentNote = 'A 100% platform fee leaves no revenue, so this target cannot be reached at any project price.';
    } else if (taxRate === 100) {
      requiredPaymentNote = 'A 100% tax rate leaves no positive take-home, so this target cannot be reached at any project price.';
    } else {
      requiredPayment = (expenses + (targetRate * totalHours) / (1 - taxRate / 100)) / (1 - feeRate / 100);
      if (!Number.isFinite(requiredPayment) || requiredPayment < 0) { requiredPayment = null; requiredPaymentNote = 'This target cannot be calculated safely with the current inputs.'; }
    }

    let verdict;
    if (takeHome < 0) {
      const shortfallCopy = targetRate > 0 ? ` It is also ${Math.abs(difference).toFixed(2)} below your target earnings for this scope.` : '';
      verdict = { type: 'negative', title: 'Project loses money', copy: `After the listed fees, expenses, and estimated taxes, this project leaves you ${Math.abs(takeHome).toFixed(2)} in the negative.${shortfallCopy}` };
    } else if (targetRate === 0) verdict = { type: 'neutral', title: 'Set a target rate', copy: 'Add a target rate to see how this project compares to your personal benchmark.' };
    else if (effectiveRate >= targetRate) verdict = { type: 'positive', title: 'Worth considering', copy: `This project clears your ${targetRate.toFixed(2)}/hr target by ${(effectiveRate - targetRate).toFixed(2)}/hr.` };
    else if (effectiveRate >= targetRate * 0.9) verdict = { type: 'caution', title: 'Borderline', copy: 'This project lands slightly below your target. A small price increase or fewer revisions could make it work.' };
    else verdict = { type: 'negative', title: 'Below your target', copy: `You would effectively earn ${effectiveRate.toFixed(2)}/hr against your ${targetRate.toFixed(2)}/hr target.` };
    const warnings = [];
    if (effectiveRate >= 0 && effectiveRate < 1) warnings.push('These inputs produce an unusually low hourly rate. The calculation is accurate; double-check the scope and payment.');
    if (takeHome < 0) warnings.push('This project would leave a negative estimated take-home after its listed costs.');
    return { ok: true, state: 'ready', values: checked.values, ...calculationValues, comparison, scenarios, requiredPayment, requiredPaymentNote, verdict, warnings };
  }
  return { calculate, validate };
})();

if (typeof module !== 'undefined') module.exports = GigWorthCore;

if (typeof document !== 'undefined') {
  const fields = { payment: document.querySelector('#payment'), mainHours: document.querySelector('#main-hours'), adminHours: document.querySelector('#admin-hours'), revisionHours: document.querySelector('#revision-hours'), feeRate: document.querySelector('#fee-rate'), expenses: document.querySelector('#expenses'), taxRate: document.querySelector('#tax-rate'), targetRate: document.querySelector('#target-rate') };
  const defaults = { payment: 1000, mainHours: 10, adminHours: 2, revisionHours: 3, feeRate: 3, expenses: 50, taxRate: 25, targetRate: 40 };
  const output = (id) => document.querySelector(id);
  const money = (value, rate = false) => { if (!Number.isFinite(value)) return '—'; if (Math.abs(value) > 0 && Math.abs(value) < 1) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 6 }).format(value); return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: rate ? 2 : 0, maximumFractionDigits: 2 }).format(value); };
  const signedMoney = (value) => `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`;
  const clear = (message) => { ['#effective-rate','#take-home','#target-difference','#fee-dollars','#expense-total','#tax-dollars','#target-display','#required-payment','#scenario-10','#scenario-25','#scenario-50'].forEach((id) => { output(id).textContent = '—'; }); ['#scenario-10-note','#scenario-25-note','#scenario-50-note'].forEach((id) => { output(id).textContent = 'Fix inputs to calculate'; }); output('.primary-result').classList.remove('loss'); output('#primary-label').textContent = 'Your real hourly rate'; output('.primary-result > span').textContent = '/hr'; output('#primary-support').hidden = true; output('#comparison-copy').textContent = 'Fix inputs to compare'; output('#required-payment-note').textContent = message; output('#result-warning').hidden = false; output('#result-warning').textContent = message; output('#verdict-card').className = 'verdict-card neutral'; output('#verdict-title').textContent = 'Check the project details'; output('#verdict-copy').textContent = message; };
  function renderIssues(issues) { const messages = Object.values(issues); Object.entries(fields).forEach(([key, field]) => field.toggleAttribute('aria-invalid', Boolean(issues[key]))); output('#form-error').hidden = false; output('#form-error').textContent = messages.join(' '); clear(messages[0]); }
  function render(result) {
    if (!result.ok) { renderIssues(result.issues); return; }
    Object.values(fields).forEach((field) => field.removeAttribute('aria-invalid')); output('#form-error').hidden = true;
    output('#total-hours').textContent = result.totalHours.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const isLoss = result.takeHome < 0;
    output('.primary-result').classList.toggle('loss', isLoss);
    output('#primary-label').textContent = isLoss ? 'You lose on this project' : 'Your real hourly rate';
    output('#effective-rate').textContent = isLoss ? money(result.takeHome) : money(result.effectiveRate, true);
    output('.primary-result > span').textContent = isLoss ? '' : '/hr';
    output('#primary-support').hidden = !isLoss;
    output('#primary-support').textContent = isLoss ? `Equivalent to a ${money(Math.abs(result.effectiveRate), true)} loss per hour across ${result.totalHours.toLocaleString('en-US', { maximumFractionDigits: 2 })} hours.` : '';
    output('#take-home').textContent = money(result.takeHome); output('#target-difference').textContent = result.values.targetRate === 0 ? '—' : signedMoney(result.difference);
    output('#comparison-copy').textContent = result.values.targetRate === 0 ? 'Set a target to compare' : `${(result.comparison * 100).toFixed(0)}% of your target`;
    output('#fee-dollars').textContent = money(result.feeDollars); output('#expense-total').textContent = money(result.values.expenses); output('#tax-dollars').textContent = money(result.taxDollars); output('#target-display').textContent = `${money(result.values.targetRate, true)}/hr`;
    output('#required-payment').textContent = result.requiredPayment === null ? '—' : money(result.requiredPayment); output('#required-payment-note').textContent = result.requiredPaymentNote || 'This is the gross project price needed to reach your target after fees, expenses, and estimated taxes.';
    result.scenarios.forEach((scenario) => {
      if (isLoss) {
        output(`#scenario-${scenario.percent}`).textContent = result.values.targetRate > 0 ? `${signedMoney(scenario.shortfall)} vs target` : `${money(result.takeHome)} total loss`;
        output(`#scenario-${scenario.percent}-note`).textContent = `${scenario.hours.toLocaleString('en-US', { maximumFractionDigits: 2 })} total hours`;
      } else {
        output(`#scenario-${scenario.percent}`).textContent = `${money(scenario.rate, true)}/hr`;
        output(`#scenario-${scenario.percent}-note`).textContent = 'effective hourly rate';
      }
    });
    output('#verdict-card').className = `verdict-card ${result.verdict.type}`; output('#verdict-title').textContent = result.verdict.title; output('#verdict-copy').textContent = result.verdict.copy;
    output('#result-warning').hidden = result.warnings.length === 0; output('#result-warning').textContent = result.warnings.join(' ');
  }
  const update = () => render(GigWorthCore.calculate(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]))));
  Object.values(fields).forEach((field) => field.addEventListener('input', update));
  output('#reset').addEventListener('click', () => { Object.entries(defaults).forEach(([key, value]) => { fields[key].value = value; }); update(); });
  update();
}
