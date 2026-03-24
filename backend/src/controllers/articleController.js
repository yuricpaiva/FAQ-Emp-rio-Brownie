const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listArticles(req, res) {
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.json(articles);
}

async function getArticleBySlug(req, res) {
  const { slug } = req.params;
  const article = await prisma.article.findUnique({ where: { slug } });

  if (!article) {
    return res.status(404).json({ error: 'Artigo não encontrado' });
  }

  return res.json(article);
}

async function listCategories(req, res) {
  const categories = await prisma.article.findMany({
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' }
  });

  res.json(categories.map((c) => c.category));
}

async function createArticle(req, res) {
  const { title, slug, category, content } = req.body;

  if (!title || !slug || !category || !content) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  try {
    let currentUser = null;
    if (req.user?.id) {
      currentUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    }
    const authorName = currentUser?.name || req.user?.name || 'Admin';
    const authorPhoto = currentUser?.photoUrl || req.user?.photoUrl || '';

    const article = await prisma.article.create({
      data: {
        title,
        slug,
        category,
        content,
        author: authorName,
        authorPhoto,
        updatedBy: authorName
      }
    });
    return res.status(201).json(article);
  } catch (err) {
    return res.status(400).json({ error: 'Não foi possível criar o artigo', details: err.message });
  }
}

async function updateArticle(req, res) {
  const { id } = req.params;
  const { title, slug, category, content } = req.body;

  try {
    let currentUser = null;
    if (req.user?.id) {
      currentUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    }
    const userName = currentUser?.name || req.user?.name || 'Admin';

    const article = await prisma.article.update({
      where: { id: Number(id) },
      data: {
        title,
        slug,
        category,
        content,
        updatedBy: userName
      }
    });
    return res.json(article);
  } catch (err) {
    return res.status(404).json({ error: 'Artigo não encontrado', details: err.message });
  }
}

async function deleteArticle(req, res) {
  const { id } = req.params;

  try {
    await prisma.article.delete({ where: { id: Number(id) } });
    return res.status(204).send();
  } catch (err) {
    return res.status(404).json({ error: 'Artigo não encontrado', details: err.message });
  }
}

module.exports = {
  listArticles,
  getArticleBySlug,
  listCategories,
  createArticle,
  updateArticle,
  deleteArticle
};
