/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { defaultCategories } = require('../data/categories');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@admin.com' },
    update: { role: 'admin', active: true },
    create: {
      name: 'Admin',
      email: 'admin@admin.com',
      passwordHash,
      role: 'admin'
    }
  });

  for (const category of defaultCategories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category
    });
  }

  const sampleArticles = [
    {
      title: 'Bem-vindo ao FAQ',
      slug: 'bem-vindo-ao-faq',
      summary: 'Visão geral rápida de como usar a base interna de conhecimento.',
      category: 'Gente & Gestão',
      content: 'Este é um artigo de exemplo para o FAQ interno.',
      status: 'published',
      sortOrder: 1,
      tags: ''
    },
    {
      title: 'Como solicitar suporte',
      slug: 'como-solicitar-suporte',
      summary: 'Canal oficial e informações mínimas para abrir uma solicitação de suporte.',
      category: 'TI',
      content: 'Envie um e-mail para suporte@emporiobrownie.com com detalhes do problema.',
      status: 'published',
      sortOrder: 2,
      tags: ''
    }
  ];

  for (const article of sampleArticles) {
    await prisma.article.upsert({
      where: { slug: article.slug },
      update: {
        ...article,
        author: 'Admin',
        updatedBy: 'Admin'
      },
      create: {
        ...article,
        author: 'Admin',
        updatedBy: 'Admin'
      }
    });
  }

  const articles = await prisma.article.findMany();
  for (const article of articles) {
    const revisionCount = await prisma.articleRevision.count({
      where: { articleId: article.id }
    });

    if (!revisionCount) {
      await prisma.articleRevision.create({
        data: {
          articleId: article.id,
          title: article.title,
          summary: article.summary,
          category: article.category,
          content: article.content,
          status: article.status,
          tags: article.tags,
          updatedBy: article.updatedBy
        }
      });
    }
  }

  console.log('Seed concluído com usuário admin padrão, categorias e artigos de exemplo.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
