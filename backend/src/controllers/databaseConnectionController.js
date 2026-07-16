const {
  getEffectiveConfiguration,
  saveDatabaseConnection,
  testDatabaseConnection,
} = require('../services/databaseConnectionSettings');

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

module.exports = {
  getDatabaseConnections,
  saveConnection,
  testConnection,
};
