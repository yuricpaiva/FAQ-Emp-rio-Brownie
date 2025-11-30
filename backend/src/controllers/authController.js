const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Credenciais obrigatórias' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'Usuário inativo' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role, photoUrl: user.photoUrl || '' },
    process.env.JWT_SECRET || 'changeme',
    { expiresIn: '7d' }
  );

  res.cookie('auth', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  return res.json({ id: user.id, name: user.name, role: user.role, photoUrl: user.photoUrl || '' });
}

async function createUser(req, res) {
  const { name, email, password, photoUrl } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: 'admin', photoUrl: photoUrl || '', active: true }
    });
    return res.status(201).json({ id: user.id, name: user.name, email: user.email, photoUrl: user.photoUrl });
  } catch (err) {
    return res.status(500).json({ error: 'Não foi possível criar o usuário', details: err.message });
  }
}

async function updateUserMe(req, res) {
  const userId = req.user?.id;
  const { name, email, password, photoUrl } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

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
      return res.status(400).json({ error: 'Email já cadastrado' });
    }
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data
    });
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      photoUrl: user.photoUrl || ''
    });
  } catch (err) {
    return res.status(500).json({ error: 'Não foi possível atualizar o usuário', details: err.message });
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
  const { id } = req.params;
  const { name, email, password, photoUrl, active } = req.body;

  const data = {};
  if (name) data.name = name;
  if (email) data.email = email;
  if (photoUrl !== undefined) data.photoUrl = photoUrl;
  if (active !== undefined) data.active = !!active;
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  if (email) {
    const exists = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id: Number(id) }
      }
    });
    if (exists) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }
  }

  try {
    const user = await prisma.user.update({
      where: { id: Number(id) },
      data,
      select: { id: true, name: true, email: true, photoUrl: true, active: true }
    });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: 'Não foi possível atualizar o usuário', details: err.message });
  }
}

module.exports = { login, createUser, updateUserMe, listUsers, updateUserAdmin };
