const { PrismaClient } = require('@prisma/client');
const {
  validateNumericId,
  validatePoolParticipantInput
} = require('../utils/validation');

const prisma = new PrismaClient();

async function getPoolSettings(_req, res) {
  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, poolEnabled: true }
  });

  return res.json({
    poolEnabled: settings.poolEnabled,
    updatedAt: settings.updatedAt
  });
}

async function updatePoolSettings(req, res) {
  if (typeof req.body?.poolEnabled !== 'boolean') {
    return res.status(400).json({ error: 'O campo poolEnabled deve ser booleano.' });
  }

  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { poolEnabled: req.body.poolEnabled },
    create: { id: 1, poolEnabled: req.body.poolEnabled }
  });

  return res.json({
    poolEnabled: settings.poolEnabled,
    updatedAt: settings.updatedAt
  });
}

async function listPoolParticipants(_req, res) {
  const participants = await prisma.poolParticipant.findMany({
    orderBy: [{ score: 'desc' }, { name: 'asc' }]
  });

  return res.json(participants);
}

async function createPoolParticipant(req, res) {
  const { error, value } = validatePoolParticipantInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const participant = await prisma.poolParticipant.create({ data: value });
    return res.status(201).json(participant);
  } catch (err) {
    return res.status(500).json({
      error: 'Nao foi possivel cadastrar o participante.',
      details: err.message
    });
  }
}

async function updatePoolParticipant(req, res) {
  const parsedId = validateNumericId(req.params.id, 'ID do participante');
  if (parsedId.error) {
    return res.status(400).json({ error: parsedId.error });
  }

  const { error, value } = validatePoolParticipantInput(req.body, { partial: true });
  if (error) {
    return res.status(400).json({ error });
  }

  const data = Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );

  if (!Object.keys(data).length) {
    return res.status(400).json({ error: 'Informe ao menos um campo para atualizar.' });
  }

  try {
    const participant = await prisma.poolParticipant.update({
      where: { id: parsedId.value },
      data
    });
    return res.json(participant);
  } catch (err) {
    return res.status(404).json({
      error: 'Participante nao encontrado.',
      details: err.message
    });
  }
}

async function deletePoolParticipant(req, res) {
  const parsedId = validateNumericId(req.params.id, 'ID do participante');
  if (parsedId.error) {
    return res.status(400).json({ error: parsedId.error });
  }

  try {
    await prisma.poolParticipant.delete({ where: { id: parsedId.value } });
    return res.status(204).send();
  } catch (err) {
    return res.status(404).json({
      error: 'Participante nao encontrado.',
      details: err.message
    });
  }
}

module.exports = {
  getPoolSettings,
  updatePoolSettings,
  listPoolParticipants,
  createPoolParticipant,
  updatePoolParticipant,
  deletePoolParticipant
};
