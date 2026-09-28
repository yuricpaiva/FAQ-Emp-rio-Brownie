const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'article-notification-test-secret';

const app = require('../app');
const { normalizeVideoUrl, validateArticleVideoEmbeds } = require('../services/articleVideoService');
const prisma = new PrismaClient();

async function login(base, email, password) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

test('article video embeds accept normalized YouTube and Drive URLs only', () => {
  assert.deepEqual(
    normalizeVideoUrl('https://www.youtube-nocookie.com/embed/abcDEF_123'),
    {
      provider: 'youtube',
      id: 'abcDEF_123',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abcDEF_123'
    }
  );
  assert.equal(normalizeVideoUrl('https://drive.google.com/file/d/drive-file_123/preview').provider, 'drive');
  assert.equal(normalizeVideoUrl('https://example.com/embed/abcDEF_123'), null);
  assert.ok(validateArticleVideoEmbeds('<p>Texto</p><iframe src="https://www.youtube-nocookie.com/embed/abcDEF_123"></iframe>').value);
  assert.match(validateArticleVideoEmbeds('<iframe src="https://example.com/video"></iframe>').error, /v\u00eddeo inv\u00e1lido/i);
});

test('publishing an article creates one internal notification per recipient and supports read state', async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = 'article123';
  const passwordHash = await bcrypt.hash(password, 4);
  const category = await prisma.category.create({
    data: { name: `Categoria ${suffix}`, slug: `categoria-${suffix}`, active: true }
  });
  const creator = await prisma.user.create({
    data: { name: 'Criador Artigo', email: `creator-article-${suffix}@test.local`, passwordHash, role: 'creator', active: true }
  });
  const reader = await prisma.user.create({
    data: { name: 'Leitor Artigo', email: `reader-article-${suffix}@test.local`, passwordHash, role: 'reader', active: true }
  });
  const server = app.listen(0);
  let articleId;

  t.after(async () => {
    server.close();
    if (articleId) await prisma.article.deleteMany({ where: { id: articleId } });
    await prisma.user.deleteMany({ where: { id: { in: [creator.id, reader.id] } } });
    await prisma.category.deleteMany({ where: { id: category.id } });
    await prisma.$disconnect();
  });

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const creatorCookie = await login(base, creator.email, password);
  const readerCookie = await login(base, reader.email, password);
  const slug = `artigo-notificacao-${suffix}`;
  const create = await fetch(`${base}/admin/articles`, {
    method: 'POST',
    headers: { cookie: creatorCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `Artigo ${suffix}`,
      slug,
      summary: 'Resumo',
      category: category.name,
      content: '<p>Conteúdo do artigo.</p>',
      status: 'draft',
      sortOrder: 0
    })
  });
  assert.equal(create.status, 201, await create.clone().text());
  articleId = (await create.json()).id;
  assert.equal(await prisma.notification.count({ where: { articleId } }), 0);

  const publish = await fetch(`${base}/admin/articles/${articleId}`, {
    method: 'PUT',
    headers: { cookie: creatorCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `Artigo ${suffix}`,
      slug,
      summary: 'Resumo',
      category: category.name,
      content: '<p>Conteúdo do artigo.</p>',
      status: 'published',
      sortOrder: 0
    })
  });
  assert.equal(publish.status, 200, await publish.clone().text());
  assert.equal(await prisma.notification.count({ where: { articleId, userId: creator.id } }), 0);
  assert.equal(await prisma.notification.count({ where: { articleId, userId: reader.id } }), 1);

  const list = await fetch(`${base}/notifications?limit=50`, { headers: { cookie: readerCookie } });
  assert.equal(list.status, 200);
  const payload = await list.json();
  const notification = payload.items.find((item) => item.link === `/artigo/${slug}`);
  assert.ok(notification);
  assert.equal(notification.read, false);

  const markRead = await fetch(`${base}/notifications/${notification.id}/read`, {
    method: 'PATCH', headers: { cookie: readerCookie }
  });
  assert.equal(markRead.status, 200);
  assert.equal((await markRead.json()).read, true);

  const republishEdit = await fetch(`${base}/admin/articles/${articleId}`, {
    method: 'PUT',
    headers: { cookie: creatorCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `Artigo ${suffix} atualizado`,
      slug,
      summary: 'Resumo',
      category: category.name,
      content: '<p>Conteúdo atualizado.</p>',
      status: 'published',
      sortOrder: 0
    })
  });
  assert.equal(republishEdit.status, 200, await republishEdit.clone().text());
  assert.equal(await prisma.notification.count({ where: { articleId, userId: reader.id } }), 1);
});
