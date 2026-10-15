const service = require('../services/calendarEventService');

function handle(res, error, fallback) {
  if (error instanceof service.CalendarEventError) {
    return res.status(error.status).json({ error: error.message });
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
  list: action((req) => service.listOccurrences(req.query, req.user), 'Não foi possível carregar os eventos.'),
  users: action((req) => service.searchUsers(req.query), 'Não foi possível pesquisar os usuários.'),
  create: action((req) => service.createEvent(req.body, req.user), 'Não foi possível criar o evento.', 201),
  update: action((req) => service.updateEvent(req.params.id, req.body, req.user), 'Não foi possível atualizar o evento.'),
  remove: action((req) => service.deleteEvent(req.params.id, req.user), 'Não foi possível excluir o evento.')
};
