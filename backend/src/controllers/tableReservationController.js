const service = require('../services/tableReservationService');

function handle(res, error, fallback) {
  if (error instanceof service.TableReservationError) {
    return res.status(error.status).json({ error: error.message, ...(error.details || {}) });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

function action(callback, fallback, successStatus = 200) {
  return async (req, res) => {
    try { return res.status(successStatus).json(await callback(req)); }
    catch (error) { return handle(res, error, fallback); }
  };
}

async function requireAccess(req, res, next) {
  try {
    const capabilities = await service.capabilitiesFor(req.user);
    if (!capabilities.hasAccess) return res.status(403).json({ error: 'Você não possui acesso à Central de Reservas.' });
    req.tableReservationCapabilities = capabilities;
    return next();
  } catch (error) { return handle(res, error, 'Não foi possível validar o acesso.'); }
}

module.exports = {
  requireAccess,
  access: action((req) => service.capabilitiesFor(req.user), 'Não foi possível consultar o acesso.'),
  capabilities: action((req) => service.capabilitiesFor(req.user), 'Não foi possível consultar as permissões.'),
  units: action((req) => service.listUnits(req.user), 'Não foi possível listar as unidades.'),
  list: action((req) => service.listReservations(req.query, req.user), 'Não foi possível listar as reservas.'),
  create: action((req) => service.createReservation(req.body, req.user), 'Não foi possível criar a reserva.', 201),
  detail: action((req) => service.getReservation(req.params.id, req.user), 'Não foi possível consultar a reserva.'),
  tables: action((req) => service.listTables(req.query, req.user), 'Não foi possível listar as mesas.'),
  checkIn: action((req) => service.checkInReservation(req.params.id, req.body, req.user), 'Não foi possível confirmar o comparecimento.'),
  adminSettings: action(() => service.getAccessSettings(), 'Não foi possível carregar as permissões.'),
  adminUpdateSettings: action((req) => service.updateAccessSettings(req.body), 'Não foi possível salvar as permissões.'),
  adminTables: action((req) => service.adminListTables(req.query), 'Não foi possível listar as mesas.'),
  adminCreateTable: action((req) => service.saveTable(req.body), 'Não foi possível criar a mesa.', 201),
  adminUpdateTable: action((req) => service.saveTable(req.body, req.params.id), 'Não foi possível atualizar a mesa.'),
};
