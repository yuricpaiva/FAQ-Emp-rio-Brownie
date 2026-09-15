const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInstructions, buildTools } = require('../services/aiAgentService');
const { htmlToText, queryTerms, scoreArticle } = require('../services/aiKnowledgeService');
const { validatePeriod } = require('../services/aiSalesService');
const { DEFAULT_AI_SETTINGS, normalizeSettingsInput, publicSettings } = require('../services/aiSettingsService');
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
