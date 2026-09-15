const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInstructions, buildTools } = require('../services/aiAgentService');
const { htmlToText, queryTerms, scoreArticle } = require('../services/aiKnowledgeService');
const { validatePeriod } = require('../services/aiSalesService');
const { DEFAULT_AI_SETTINGS, normalizeSettingsInput, publicSettings } = require('../services/aiSettingsService');
const { currentUtcMonth, getOpenAiUsageSummary, sumCosts } = require('../services/aiUsageService');
const { isOpenAiCreditsError } = require('../controllers/aiController');

test('Browninho settings validates limits and never exposes the API key', () => {
  const settings = normalizeSettingsInput({ ...DEFAULT_AI_SETTINGS });
  const visible = publicSettings(settings, { role: 'admin' });
  assert.equal(Object.hasOwn(visible, 'apiKey'), false);
  assert.equal(visible.capabilities.sales, true);
  assert.throws(() => normalizeSettingsInput({ ...DEFAULT_AI_SETTINGS, maxHistoryMessages: 100 }), /entre 2 e 60/);
});

test('Browninho exposes only tools allowed by settings and user role', () => {
  const readerTools = buildTools(DEFAULT_AI_SETTINGS, { role: 'reader' }, []);
  assert.deepEqual(readerTools.map((tool) => tool.type), ['function', 'image_generation']);
  const adminTools = buildTools(DEFAULT_AI_SETTINGS, { role: 'admin' }, ['file-1']);
  assert.deepEqual(adminTools.map((tool) => tool.type), ['function', 'function', 'function', 'code_interpreter', 'image_generation']);
});

test('Browninho knowledge strips markup and ranks matching FAQ content', () => {
  const article = { title: 'Contagem de estoque', summary: 'Procedimento das lojas', content: '<p>Finalize a contagem após revisar os produtos.</p>' };
  assert.equal(htmlToText(article.content), 'Finalize a contagem após revisar os produtos.');
  assert.ok(scoreArticle(article, queryTerms('como finalizar contagem')) > 0);
});

test('Browninho sales dates enforce order and configured maximum', () => {
  assert.equal(validatePeriod('2026-09-01', '2026-09-15', 30).days, 15);
  assert.throws(() => validatePeriod('2026-09-15', '2026-09-01', 30), /posterior/);
  assert.throws(() => validatePeriod('2026-01-01', '2026-09-15', 30), /máximo/);
});

test('Browninho base instructions identify read-only behavior', () => {
  const text = buildInstructions(DEFAULT_AI_SETTINGS, { id: 1, name: 'Teste', role: 'admin' });
  assert.match(text, /Browninho/);
  assert.match(text, /nunca afirme que alterou registros/i);
});

test('Browninho distinguishes exhausted credits from temporary rate limits', () => {
  assert.equal(isOpenAiCreditsError({ code: 'insufficient_quota', status: 429 }), true);
  assert.equal(isOpenAiCreditsError({ error: { code: 'billing_hard_limit_reached' } }), true);
  assert.equal(isOpenAiCreditsError({ code: 'rate_limit_exceeded', status: 429 }), false);
});

test('Browninho aggregates official OpenAI costs without estimating tokens', () => {
  const costs = sumCosts({
    data: [
      { results: [{ amount: { currency: 'usd', value: 1.25 } }, { amount: { currency: 'usd', value: 0.75 } }] },
      { results: [{ amount: { currency: 'usd', value: 2.5 } }] },
    ],
  });
  assert.deepEqual(costs, [{ currency: 'USD', amount: 4.5 }]);

  const range = currentUtcMonth(new Date('2026-09-15T12:00:00.000Z'));
  assert.equal(range.start.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-09-15T12:00:00.000Z');
});

test('Browninho reports real project spend and remaining hard limit', async () => {
  const previousAdminKey = process.env.OPENAI_ADMIN_KEY;
  const previousProjectId = process.env.OPENAI_PROJECT_ID;
  process.env.OPENAI_ADMIN_KEY = 'test-admin-key';
  process.env.OPENAI_PROJECT_ID = 'proj_browninho';
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url.toString());
    if (url.pathname.endsWith('/spend_limit')) {
      return { ok: true, status: 200, json: async () => ({ threshold_amount: 2000, currency: 'USD', interval: 'month', enforcement: { status: 'enforcing' } }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: [{ results: [{ amount: { currency: 'usd', value: 6.4 } }] }], has_more: false }) };
  };

  try {
    const summary = await getOpenAiUsageSummary({ now: new Date('2026-09-15T12:00:00.000Z'), fetchImpl });
    assert.equal(summary.scope, 'project');
    assert.equal(summary.usdSpent, 6.4);
    assert.equal(summary.spendLimit.amount, 20);
    assert.equal(summary.spendLimit.remaining, 13.6);
    assert.equal(summary.spendLimit.usedPercent, 32);
    assert.ok(requestedUrls.some((url) => url.includes('project_ids=proj_browninho')));
  } finally {
    if (previousAdminKey === undefined) delete process.env.OPENAI_ADMIN_KEY;
    else process.env.OPENAI_ADMIN_KEY = previousAdminKey;
    if (previousProjectId === undefined) delete process.env.OPENAI_PROJECT_ID;
    else process.env.OPENAI_PROJECT_ID = previousProjectId;
  }
});
