const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = require('../app');
const prisma = new PrismaClient();

test('auth protects readers routes and admin routes use the session cookie', async (t) => {
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@admin.com' },
    update: { passwordHash, role: 'admin', active: true },
    create: {
      name: 'Admin',
      email: 'admin@admin.com',
      passwordHash,
      role: 'admin',
      active: true
    }
  });

  const server = app.listen(0);
  t.after(async () => {
    server.close();
    await prisma.$disconnect();
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const blocked = await fetch(`${base}/knowledge/articles`);
  assert.equal(blocked.status, 401);

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@admin.com', password: 'admin123' })
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];

  assert.equal(login.status, 200);
  assert.ok(cookie);

  const articles = await fetch(`${base}/knowledge/articles`, { headers: { cookie } });
  assert.equal(articles.status, 200);

  const users = await fetch(`${base}/admin/users`, { headers: { cookie } });
  assert.equal(users.status, 200);

  const logout = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 204);
});
