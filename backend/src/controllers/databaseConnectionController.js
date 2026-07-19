const { PrismaClient } = require('@prisma/client');
const {
  getEffectiveConfiguration,
  saveDatabaseConnection,
  testDatabaseConnection,
} = require('../services/databaseConnectionSettings');
const { getEverestDiagnosticSnapshot } = require('../services/everestDatabase');
const { buildEverestDiagnosticReport } = require('../services/everestDiagnostic');

const prisma = new PrismaClient();

function getDatabaseConnections(_req, res) {
  return res.json({
    dw: getEffectiveConfiguration('dw'),
    everest: getEffectiveConfiguration('everest'),
  });
}

async function testConnection(req, res) {
  try {
    const result = await testDatabaseConnection(req.params.system, req.body, req.user.id);
    if (!result.success) {
      console.warn('Teste de conexao com banco falhou:', {
        system: req.params.system,
        userId: req.user.id,
        code: result.error?.code || 'CONNECTION_FAILED',
      });
    }
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Nao foi possivel testar a conexao.' });
  }
}

async function saveConnection(req, res) {
  try {
    const configuration = await saveDatabaseConnection(
      req.params.system,
      req.body?.configuration,
      req.body?.validationToken,
      req.user.id
    );
    return res.json({ configuration, message: 'Configuracao salva e aplicada com sucesso.' });
  } catch (error) {
    console.error('Falha ao salvar configuracao de banco:', { system: req.params.system, code: error.code || 'SAVE_FAILED' });
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Nao foi possivel salvar a configuracao.' });
  }
}

async function downloadEverestDiagnostic(req, res) {
  try {
    const [stores, products, snapshot] = await Promise.all([
      prisma.productionStore.findMany({
        where: { active: true },
        select: { displayName: true, sourceName: true },
        orderBy: { displayName: 'asc' },
      }),
      prisma.productionProduct.findMany({
        where: { active: true },
        select: { code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      getEverestDiagnosticSnapshot(),
    ]);
    const report = buildEverestDiagnosticReport({
      snapshot,
      stores,
      products,
      configuration: getEffectiveConfiguration('everest'),
      generatedBy: 'authenticated-admin',
    });
    const filename = `diagnostico-estoque-${snapshot.stockDate}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    console.error('Falha ao gerar diagnostico do Everest:', {
      userId: req.user.id,
      code: error.code || 'DIAGNOSTIC_FAILED',
    });
    return res.status(500).json({ error: 'Nao foi possivel gerar o diagnostico do estoque.' });
  }
}

module.exports = {
  downloadEverestDiagnostic,
  getDatabaseConnections,
  saveConnection,
  testConnection,
};
