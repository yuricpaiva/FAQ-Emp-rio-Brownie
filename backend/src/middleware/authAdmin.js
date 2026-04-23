const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET nao configurado');
  }
  return secret;
}

async function authenticate(req, res, next) {
  const token = req.cookies?.auth;

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Sessão inválida.' });
    }
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      photoUrl: user.photoUrl || ''
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    return next();
  };
}

module.exports = {
  authenticate,
  requireRole,
  getJwtSecret
};
