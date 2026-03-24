/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@admin.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@admin.com',
      passwordHash,
      role: 'admin'
    }
  });

  const sampleArticles = [
    {
      title: 'Bem-vindo ao FAQ',
      slug: 'bem-vindo-ao-faq',
      category: 'Geral',
      content: 'Este é um artigo de exemplo para o FAQ interno.'
    },
    {
      title: 'Como solicitar suporte',
      slug: 'como-solicitar-suporte',
      category: 'Suporte',
      content: 'Envie um e-mail para suporte@emporiobrownie.com com detalhes do problema.'
    }
  ];

  for (const article of sampleArticles) {
    await prisma.article.upsert({
      where: { slug: article.slug },
      update: article,
      create: article
    });
  }

  console.log('Seed concluído com usuário admin padrão e artigos de exemplo.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
