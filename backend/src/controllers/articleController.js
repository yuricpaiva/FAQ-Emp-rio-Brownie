const { PrismaClient } = require('@prisma/client');
const mammoth = require('mammoth');
const fs = require('fs/promises');
const path = require('path');
const { validateArticleInput, validateNumericId, VALID_ARTICLE_STATUS } = require('../utils/validation');

const prisma = new PrismaClient();
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

function canReadDrafts(req) {
  return ['creator', 'admin'].includes(req.user?.role);
}

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inferImageExtension(contentType) {
  const normalizedType = String(contentType || '').toLowerCase();

  if (normalizedType.includes('png')) return '.png';
  if (normalizedType.includes('gif')) return '.gif';
  if (normalizedType.includes('webp')) return '.webp';
  return '.jpg';
}

function extractTitleFromHtml(html, fallback) {
  const match = String(html || '').match(/<h1[^>]*>(.*?)<\/h1>/i);
  const raw = match?.[1]
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return raw || fallback;
}

function serializeArticle(article, category) {
  return {
    ...article,
    tags: [],
    categorySlug: category?.slug || '',
    categoryIconKey: category?.iconKey || 'default'
  };
}

async function getCategoryMap() {
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  });

  return new Map(categories.map((category) => [category.name, category]));
}

async function ensureCategoryExists(categoryName) {
  const category = await prisma.category.findUnique({
    where: { name: categoryName }
  });

  return category?.active ? category : null;
}

async function createRevision(article, updatedBy) {
  await prisma.articleRevision.create({
    data: {
      articleId: article.id,
      title: article.title,
      summary: article.summary,
      category: article.category,
      content: article.content,
      status: article.status,
      tags: article.tags,
      updatedBy: updatedBy || article.updatedBy || 'Admin'
    }
  });
}

async function listArticles(req, res) {
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const requestedStatus = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
  const categorySlug = typeof req.query.category === 'string' ? req.query.category.trim() : '';

  const where = {};

  if (canReadDrafts(req)) {
    if (requestedStatus && VALID_ARTICLE_STATUS.includes(requestedStatus)) {
      where.status = requestedStatus;
    }
  } else {
    where.status = 'published';
  }

  if (categorySlug) {
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!category || !category.active) {
      return res.json([]);
    }
    where.category = category.name;
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { summary: { contains: search } },
      { content: { contains: search } },
      { author: { contains: search } },
      { updatedBy: { contains: search } },
      { category: { contains: search } }
    ];
  }

  const [articles, categoryMap] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }]
    }),
    getCategoryMap()
  ]);

  res.json(articles.map((article) => serializeArticle(article, categoryMap.get(article.category))));
}

async function getArticleBySlug(req, res) {
  const { slug } = req.params;
  const article = await prisma.article.findUnique({ where: { slug } });

  if (!article || (!canReadDrafts(req) && article.status !== 'published')) {
    return res.status(404).json({ error: 'Artigo não encontrado.' });
  }

  const category = await prisma.category.findUnique({ where: { name: article.category } });
  return res.json(serializeArticle(article, category));
}

async function getArticleById(req, res) {
  const parsedId = validateNumericId(req.params.id, 'ID do artigo');
  if (parsedId.error) {
    return res.status(400).json({ error: parsedId.error });
  }

  const article = await prisma.article.findUnique({ where: { id: parsedId.value } });
  if (!article || (!canReadDrafts(req) && article.status !== 'published')) {
    return res.status(404).json({ error: 'Artigo não encontrado.' });
  }

  const category = await prisma.category.findUnique({ where: { name: article.category } });
  return res.json(serializeArticle(article, category));
}

async function listCategories(req, res) {
  const articleWhere = canReadDrafts(req) ? {} : { status: 'published' };
  const [categories, grouped] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    }),
    prisma.article.groupBy({
      by: ['category'],
      where: articleWhere,
      _count: { _all: true }
    })
  ]);

  const counts = new Map(grouped.map((item) => [item.category, item._count._all]));
  res.json(
    categories.map((category) => ({
      ...category,
      articleCount: counts.get(category.name) || 0
    }))
  );
}

async function importWordArticle(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  try {
    await fs.mkdir(uploadsDir, { recursive: true });

    const conversion = await mammoth.convertToHtml(
      { buffer: req.file.buffer },
      {
        convertImage: mammoth.images.inline(async (image) => {
          const base64 = await image.read('base64');
          const buffer = Buffer.from(base64, 'base64');
          const extension = inferImageExtension(image.contentType);
          const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
          const filePath = path.join(uploadsDir, filename);
          await fs.writeFile(filePath, buffer);

          return {
            src: `${req.protocol}://${req.get('host')}/uploads/${filename}`
          };
        })
      }
    );

    const fallbackTitle = slugify(path.parse(req.file.originalname).name)
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Novo artigo';

    const html = conversion.value?.trim();
    const content = html || `<p>${escapeHtml(fallbackTitle)}</p>`;
    const title = extractTitleFromHtml(content, fallbackTitle);

    return res.json({
      title,
      content,
      warnings: conversion.messages.map((message) => message.message)
    });
  } catch (err) {
    return res.status(400).json({
      error: 'Não foi possível importar o documento Word.',
      details: err.message
    });
  }
}

async function createArticle(req, res) {
  const { error, value } = validateArticleInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const { title, slug, summary, category, content, status, sortOrder } = value;
  const categoryRecord = await ensureCategoryExists(category);
  if (!categoryRecord) {
    return res.status(400).json({ error: 'Categoria inválida.' });
  }

  try {
    const currentUser = req.user?.id
      ? await prisma.user.findUnique({ where: { id: req.user.id } })
      : null;
    const authorName = currentUser?.name || req.user?.name || 'Admin';
    const authorPhoto = currentUser?.photoUrl || req.user?.photoUrl || '';

    const article = await prisma.article.create({
      data: {
        title,
        slug,
        summary,
        category,
        content,
        status,
        sortOrder,
        tags: '',
        author: authorName,
        authorPhoto,
        updatedBy: authorName
      }
    });

    await createRevision(article, authorName);
    return res.status(201).json(serializeArticle(article, categoryRecord));
  } catch (err) {
    return res.status(400).json({ error: 'Não foi possível criar o artigo.', details: err.message });
  }
}

async function updateArticle(req, res) {
  const parsedId = validateNumericId(req.params.id, 'ID do artigo');
  if (parsedId.error) {
    return res.status(400).json({ error: parsedId.error });
  }

  const { error, value } = validateArticleInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const { title, slug, summary, category, content, status, sortOrder } = value;
  const categoryRecord = await ensureCategoryExists(category);
  if (!categoryRecord) {
    return res.status(400).json({ error: 'Categoria inválida.' });
  }

  try {
    const currentUser = req.user?.id
      ? await prisma.user.findUnique({ where: { id: req.user.id } })
      : null;
    const userName = currentUser?.name || req.user?.name || 'Admin';
    const userPhoto = currentUser?.photoUrl || req.user?.photoUrl || '';

    const article = await prisma.article.update({
      where: { id: parsedId.value },
      data: {
        title,
        slug,
        summary,
        category,
        content,
        status,
        sortOrder,
        tags: '',
        authorPhoto: userPhoto,
        updatedBy: userName
      }
    });

    await createRevision(article, userName);
    return res.json(serializeArticle(article, categoryRecord));
  } catch (err) {
    return res.status(404).json({ error: 'Artigo não encontrado.', details: err.message });
  }
}

async function deleteArticle(req, res) {
  const parsedId = validateNumericId(req.params.id, 'ID do artigo');
  if (parsedId.error) {
    return res.status(400).json({ error: parsedId.error });
  }

  try {
    await prisma.article.delete({ where: { id: parsedId.value } });
    return res.status(204).send();
  } catch (err) {
    return res.status(404).json({ error: 'Artigo não encontrado.', details: err.message });
  }
}

async function listArticleRevisions(req, res) {
  const parsedId = validateNumericId(req.params.id, 'ID do artigo');
  if (parsedId.error) {
    return res.status(400).json({ error: parsedId.error });
  }

  const revisions = await prisma.articleRevision.findMany({
    where: { articleId: parsedId.value },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  res.json(revisions.map((revision) => ({ ...revision, tags: [] })));
}

module.exports = {
  listArticles,
  getArticleBySlug,
  getArticleById,
  listCategories,
  importWordArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  listArticleRevisions
};
