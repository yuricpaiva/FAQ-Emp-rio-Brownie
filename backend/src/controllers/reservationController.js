const service = require('../services/reservationService');

function handle(res, error, fallback) {
  if (error instanceof service.ReservationError) {
    return res.status(error.status).json({ error: error.message, ...(error.details || {}) });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

function action(callback, fallback, successStatus = 200) {
  return async (req, res) => {
    try {
      const result = await callback(req);
      return res.status(successStatus).json(result);
    } catch (error) {
      return handle(res, error, fallback);
    }
  };
}

module.exports = {
  listResourceTypes: action(() => service.listResourceTypes(), 'Não foi possível listar os tipos.'),
  listResources: action((req) => service.listResources({ typeId: req.query.typeId }), 'Não foi possível listar os recursos.'),
  availability: action((req) => service.availability(req.query), 'Não foi possível consultar a disponibilidade.'),
  calendar: action((req) => service.calendar(req.query, req.user), 'Não foi possível carregar o calendário.'),
  mine: action((req) => service.mine(req.user), 'Não foi possível listar suas reservas.'),
  createReservation: action((req) => service.createReservation(req.body, req.user), 'Não foi possível criar a reserva.', 201),
  cancelReservation: action((req) => service.cancelReservation(req.params.id, req.body, req.user), 'Não foi possível cancelar a reserva.'),
  adminListTypes: action(() => service.listResourceTypes({ admin: true }), 'Não foi possível listar os tipos.'),
  adminCreateType: action((req) => service.saveResourceType(req.body), 'Não foi possível criar o tipo.', 201),
  adminUpdateType: action((req) => service.saveResourceType(req.body, req.params.id), 'Não foi possível atualizar o tipo.'),
  adminListResources: action(() => service.listResources({ admin: true }), 'Não foi possível listar os recursos.'),
  adminCreateResource: action((req) => service.saveResource(req.body), 'Não foi possível criar o recurso.', 201),
  adminUpdateResource: action((req) => service.saveResource(req.body, req.params.id), 'Não foi possível atualizar o recurso.'),
  adminListBlocks: action((req) => service.listBlocks(req.user), 'Não foi possível listar os bloqueios.'),
  adminCreateBlock: action((req) => service.createBlock(req.body, req.user), 'Não foi possível criar o bloqueio.', 201),
  adminCancelBlock: action((req) => service.cancelBlock(req.params.id, req.body, req.user), 'Não foi possível cancelar o bloqueio.'),
  adminListReservations: action((req) => service.listAllReservations(req.query, req.user), 'Não foi possível listar as reservas.'),
  adminCancelReservation: action((req) => service.cancelReservation(req.params.id, req.body, req.user, { admin: true }), 'Não foi possível cancelar a reserva.'),
};
