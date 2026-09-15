const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

class AiUsageError extends Error {
  constructor(message, status = 502, code = 'OPENAI_USAGE_ERROR') {
    super(message);
    this.name = 'AiUsageError';
    this.status = status;
    this.code = code;
  }
}

function getUsageConfiguration() {
  return {
    adminKey: String(process.env.OPENAI_ADMIN_KEY || '').trim(),
    projectId: String(process.env.OPENAI_PROJECT_ID || '').trim(),
  };
}

function currentUtcMonth(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(now);
  return {
    start,
    end,
    startTime: Math.floor(start.getTime() / 1000),
    endTime: Math.floor(end.getTime() / 1000) + 1,
  };
}

function sumCosts(payload = {}) {
  const totals = new Map();
  for (const bucket of payload.data || []) {
    for (const result of bucket.results || []) {
      const currency = String(result?.amount?.currency || 'usd').toUpperCase();
      const value = Number(result?.amount?.value || 0);
      if (Number.isFinite(value)) totals.set(currency, (totals.get(currency) || 0) + value);
    }
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

async function openAiAdminRequest(path, { adminKey, query = {}, fetchImpl = fetch, allowNotFound = false }) {
  const url = new URL(`${OPENAI_API_BASE_URL}${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
    else url.searchParams.set(key, String(value));
  });

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new AiUsageError('A OpenAI demorou para responder. Tente atualizar novamente.', 504, 'OPENAI_USAGE_TIMEOUT');
    }
    throw new AiUsageError('Não foi possível consultar os custos na OpenAI.', 502, 'OPENAI_USAGE_UNAVAILABLE');
  }

  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 503 : 502;
    const code = response.status === 401 || response.status === 403 ? 'OPENAI_ADMIN_KEY_INVALID' : 'OPENAI_USAGE_ERROR';
    const message = status === 503
      ? 'A chave administrativa da OpenAI não foi aceita ou não possui permissão para consultar custos.'
      : 'A OpenAI não conseguiu retornar os custos neste momento.';
    throw new AiUsageError(message, status, code);
  }
  return response.json();
}

async function getAllCosts(configuration, range, fetchImpl) {
  const data = [];
  let page;
  do {
    const payload = await openAiAdminRequest('/organization/costs', {
      adminKey: configuration.adminKey,
      fetchImpl,
      query: {
        start_time: range.startTime,
        end_time: range.endTime,
        bucket_width: '1d',
        limit: 31,
        project_ids: configuration.projectId ? [configuration.projectId] : undefined,
        page,
      },
    });
    data.push(...(payload.data || []));
    page = payload.has_more ? payload.next_page : null;
  } while (page);
  return { data };
}

async function getSpendLimit(configuration, fetchImpl) {
  const path = configuration.projectId
    ? `/organization/projects/${encodeURIComponent(configuration.projectId)}/spend_limit`
    : '/organization/spend_limit';
  return openAiAdminRequest(path, {
    adminKey: configuration.adminKey,
    fetchImpl,
    allowNotFound: true,
  });
}

async function getOpenAiUsageSummary({ now = new Date(), fetchImpl = fetch } = {}) {
  const configuration = getUsageConfiguration();
  if (!configuration.adminKey) {
    return {
      configured: false,
      environmentVariable: 'OPENAI_ADMIN_KEY',
      projectFilterConfigured: Boolean(configuration.projectId),
    };
  }

  const range = currentUtcMonth(now);
  const [costPayload, spendLimit] = await Promise.all([
    getAllCosts(configuration, range, fetchImpl),
    getSpendLimit(configuration, fetchImpl),
  ]);
  const costs = sumCosts(costPayload);
  const usdSpent = costs.find((item) => item.currency === 'USD')?.amount || 0;
  const limitAmount = Number.isFinite(Number(spendLimit?.threshold_amount))
    ? Number(spendLimit.threshold_amount) / 100
    : null;

  return {
    configured: true,
    scope: configuration.projectId ? 'project' : 'organization',
    projectFilterConfigured: Boolean(configuration.projectId),
    period: { start: range.start.toISOString(), end: range.end.toISOString(), timeZone: 'UTC' },
    costs,
    usdSpent,
    spendLimit: limitAmount === null ? null : {
      amount: limitAmount,
      currency: String(spendLimit.currency || 'USD').toUpperCase(),
      interval: spendLimit.interval || 'month',
      enforcementStatus: spendLimit.enforcement?.status || 'inactive',
      remaining: Math.max(0, limitAmount - usdSpent),
      usedPercent: limitAmount > 0 ? Math.min(100, (usdSpent / limitAmount) * 100) : 0,
    },
    updatedAt: now.toISOString(),
  };
}

module.exports = { AiUsageError, currentUtcMonth, getOpenAiUsageSummary, sumCosts };
