const { PrismaClient } = require('@prisma/client');
const { queryDw } = require('./dwDatabase');
const { normalizeText } = require('./aiKnowledgeService');

const prisma = new PrismaClient();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class AiToolError extends Error {
  constructor(message, status = 400, code = 'AI_TOOL_ERROR') {
    super(message);
    this.name = 'AiToolError';
    this.status = status;
    this.code = code;
  }
}

function parseDate(value, label) {
  const normalized = String(value || '').trim();
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (!DATE_PATTERN.test(normalized) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new AiToolError(`${label} deve estar no formato AAAA-MM-DD.`);
  }
  return { value: normalized, date };
}

function validatePeriod(startDate, endDate, maxDays) {
  const start = parseDate(startDate, 'A data inicial');
  const end = parseDate(endDate, 'A data final');
  const days = Math.floor((end.date - start.date) / 86400000) + 1;
  if (days < 1) throw new AiToolError('A data final deve ser igual ou posterior à data inicial.');
  if (days > maxDays) throw new AiToolError(`O período consultado pode ter no máximo ${maxDays} dias.`);
  return { startDate: start.value, endDate: end.value, days };
}

async function resolveAllowedStores(user, requestedNames = []) {
  const stores = await prisma.productionStore.findMany({
    where: { active: true },
    select: { id: true, sourceName: true, displayName: true },
    orderBy: { displayName: 'asc' },
  });
  let available = stores;
  if (user.role === 'store') {
    available = stores.filter((store) => store.id === user.productionStoreId);
    if (!available.length) throw new AiToolError('Seu usuário não possui uma loja ativa vinculada.', 403, 'AI_STORE_NOT_LINKED');
  }
  const requested = [...new Set((Array.isArray(requestedNames) ? requestedNames : []).map(normalizeText).filter(Boolean))];
  if (!requested.length) return available;
  const selected = available.filter((store) => requested.includes(normalizeText(store.displayName)) || requested.includes(normalizeText(store.sourceName)));
  if (selected.length !== requested.length) throw new AiToolError('Uma ou mais lojas solicitadas não existem ou não estão disponíveis para seu usuário.', 403, 'AI_STORE_FORBIDDEN');
  return selected;
}

function numericRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (['faturamento', 'descontos', 'ticket_medio', 'quantidade'].includes(key)) return [key, Number(value || 0)];
    if (key === 'vendas') return [key, Number(value || 0)];
    return [key, value];
  })));
}

async function querySalesSummary(args, context) {
  if (!context.settings.salesEnabled || !context.settings.salesRoles.includes(context.user.role)) {
    throw new AiToolError('Seu perfil não possui autorização para consultar vendas pelo Browninho.', 403, 'AI_SALES_FORBIDDEN');
  }
  const period = validatePeriod(args.startDate, args.endDate, context.settings.maxSalesRangeDays);
  const stores = await resolveAllowedStores(context.user, args.storeNames);
  if (!stores.length) throw new AiToolError('Não há lojas ativas disponíveis para consulta.');
  const dimensions = {
    total: { select: "'Total'::text", group: '' },
    store: { select: 'v.loja', group: 'v.loja' },
    day: { select: "TO_CHAR(v.data_movimento, 'YYYY-MM-DD')", group: 'v.data_movimento' },
    channel: { select: "COALESCE(NULLIF(TRIM(v.tipo_venda), ''), NULLIF(TRIM(v.tipo_pdv), ''), 'Não informado')", group: "COALESCE(NULLIF(TRIM(v.tipo_venda), ''), NULLIF(TRIM(v.tipo_pdv), ''), 'Não informado')" },
  };
  const dimension = dimensions[args.groupBy] || dimensions.total;
  const result = await queryDw(`
    SELECT
      ${dimension.select} AS grupo,
      COUNT(DISTINCT v.id)::int AS vendas,
      COALESCE(SUM(v.total_venda), 0)::numeric AS faturamento,
      COALESCE(SUM(v.desconto), 0)::numeric AS descontos,
      CASE WHEN COUNT(DISTINCT v.id) > 0
        THEN COALESCE(SUM(v.total_venda), 0) / COUNT(DISTINCT v.id)
        ELSE 0 END::numeric AS ticket_medio
    FROM dw.vendas v
    WHERE COALESCE(v.cancelado, false) = false
      AND v.data_movimento >= $1::date
      AND v.data_movimento < ($2::date + INTERVAL '1 day')
      AND v.loja = ANY($3::text[])
    ${dimension.group ? `GROUP BY ${dimension.group}` : ''}
    ORDER BY grupo
  `, [period.startDate, period.endDate, stores.map((store) => store.sourceName)]);
  return {
    metricDefinition: 'Faturamento = soma de total_venda das vendas não canceladas. Ticket médio = faturamento dividido pela quantidade de vendas distintas.',
    period,
    stores: stores.map((store) => store.displayName),
    groupBy: args.groupBy || 'total',
    rows: numericRows(result.rows),
  };
}

async function queryTopProducts(args, context) {
  if (!context.settings.salesEnabled || !context.settings.salesRoles.includes(context.user.role)) {
    throw new AiToolError('Seu perfil não possui autorização para consultar vendas pelo Browninho.', 403, 'AI_SALES_FORBIDDEN');
  }
  const period = validatePeriod(args.startDate, args.endDate, context.settings.maxSalesRangeDays);
  const stores = await resolveAllowedStores(context.user, args.storeNames);
  if (!stores.length) throw new AiToolError('Não há lojas ativas disponíveis para consulta.');
  const limit = Math.max(1, Math.min(Number(args.limit) || 10, 50));
  const result = await queryDw(`
    SELECT
      p.codigo_produto AS codigo,
      MAX(p.descricao_produto) AS produto,
      COALESCE(SUM(p.quantidade), 0)::numeric AS quantidade
    FROM dw.produtos p
    JOIN dw.vendas v ON v.id = p.venda_id
    WHERE COALESCE(v.cancelado, false) = false
      AND v.data_movimento >= $1::date
      AND v.data_movimento < ($2::date + INTERVAL '1 day')
      AND v.loja = ANY($3::text[])
      AND p.item_type IN ('PRODUCT', 'CANADD')
    GROUP BY p.codigo_produto
    ORDER BY quantidade DESC, produto
    LIMIT $4
  `, [period.startDate, period.endDate, stores.map((store) => store.sourceName), limit]);
  return { period, stores: stores.map((store) => store.displayName), rows: numericRows(result.rows) };
}

module.exports = { AiToolError, parseDate, querySalesSummary, queryTopProducts, resolveAllowedStores, validatePeriod };
