const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { getJwtSecret } = require('../middleware/authAdmin');
const {
  validateLoginInput,
  validateCreateUserInput,
  validateSelfUserUpdateInput,
  validateAdminUserUpdateInput,
  validateNumericId
} = require('../utils/validation');

const prisma = new PrismaClient();

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = process.env.COOKIE_SAMESITE || 'lax';

  return {
    httpOnly: true,
    sameSite,
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    photoUrl: user.photoUrl || '',
    active: user.active
  };
}

async function login(req, res) {
  const { error, value } = validateLoginInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }
  const { email, password } = value;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'Usuário inativo.' });
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    return res.status(500).json({ error: 'JWT_SECRET não configurado.' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, photoUrl: user.photoUrl || '' },
    secret,
    { expiresIn: '7d' }
  );

  res.cookie('auth', token, getCookieOptions());

  return res.json(publicUser(user));
}

function logout(_req, res) {
  const cookieOptions = getCookieOptions();
  res.clearCookie('auth', {
    httpOnly: cookieOptions.httpOnly,
    sameSite: cookieOptions.sameSite,
    secure: cookieOptions.secure
  });
  return res.status(204).send();
}

async function me(req, res) {
  const userId = req.user?.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.active) {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }

  return res.json(publicUser(user));
}

async function createUser(req, res) {
  const { error, value } = validateCreateUserInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }
  const { name, email, password, photoUrl, role } = value;

  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return res.status(400).json({ error: 'Email já cadastrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role, photoUrl: photoUrl || '', active: true }
    });
    return res.status(201).json(publicUser(user));
  } catch (err) {
    return res.status(500).json({ error: 'Não foi possível criar o usuário.', details: err.message });
  }
}

async function updateUserMe(req, res) {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  const { error, value } = validateSelfUserUpdateInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }
  const { name, email, password, photoUrl } = value;

  const data = {};
  if (name) data.name = name;
  if (email) data.email = email;
  if (photoUrl !== undefined) data.photoUrl = photoUrl;
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  if (email) {
    const exists = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id: userId }
      }
    });
    if (exists) {
      return res.status(400).json({ error: 'Email já cadastrado.' });
    }
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data
    });
    return res.json(publicUser(user));
  } catch (err) {
    return res.status(500).json({ error: 'Não foi possível atualizar o usuário.', details: err.message });
  }
}

async function listUsers(_req, res) {
  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, role: true, photoUrl: true, active: true }
  });
  return res.json(users);
}

async function updateUserAdmin(req, res) {
  const parsedId = validateNumericId(req.params.id, 'ID do usuário');
  if (parsedId.error) {
    return res.status(400).json({ error: parsedId.error });
  }
  const { error, value } = validateAdminUserUpdateInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }
  const targetId = parsedId.value;
  const { name, email, password, photoUrl, active, role } = value;

  const data = {};
  if (name) data.name = name;
  if (email) data.email = email;
  if (photoUrl !== undefined) data.photoUrl = photoUrl;
  if (active !== undefined) data.active = !!active;
  if (role !== undefined) data.role = role;
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  if (email) {
    const exists = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id: targetId }
      }
    });
    if (exists) {
      return res.status(400).json({ error: 'Email já cadastrado.' });
    }
  }

  if (targetId === req.user?.id && data.active === false) {
    return res.status(400).json({ error: 'Você não pode inativar o próprio usuário.' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: targetId },
      data,
      select: { id: true, name: true, email: true, role: true, photoUrl: true, active: true }
    });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: 'Não foi possível atualizar o usuário.', details: err.message });
  }
}

module.exports = { login, logout, me, createUser, updateUserMe, listUsers, updateUserAdmin };
