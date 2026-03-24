const jwt = require('jsonwebtoken');

function authAdmin(req, res, next) {
  const token = req.cookies?.auth;

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'changeme');
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = authAdmin;
