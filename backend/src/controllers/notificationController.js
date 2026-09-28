const { PrismaClient } = require('@prisma/client');
const { validateNumericId } = require('../utils/validation');

const prisma = new PrismaClient();

function serialize(notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link,
    read: Boolean(notification.readAt),
    readAt: notification.readAt,
    createdAt: notification.createdAt
  };
}

async function listNotifications(req, res) {
  const rawLimit = Number(req.query.limit || 10);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 10;
  const where = { userId: req.user.id };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    }),
    prisma.notification.count({ where: { ...where, readAt: null } })
  ]);

  return res.json({
    items: notifications.map(serialize),
    unreadCount
  });
}

async function markNotificationRead(req, res) {
  const parsedId = validateNumericId(req.params.id, 'ID da notifica\u00e7\u00e3o');
  if (parsedId.error) return res.status(400).json({ error: parsedId.error });

  const result = await prisma.notification.updateMany({
    where: { id: parsedId.value, userId: req.user.id, readAt: null },
    data: { readAt: new Date() }
  });

  if (!result.count) {
    const existing = await prisma.notification.findFirst({
      where: { id: parsedId.value, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Notifica\u00e7\u00e3o n\u00e3o encontrada.' });
    return res.json(serialize(existing));
  }

  const notification = await prisma.notification.findUnique({ where: { id: parsedId.value } });
  return res.json(serialize(notification));
}

async function markAllNotificationsRead(req, res) {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() }
  });
  return res.status(204).send();
}

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead
};
