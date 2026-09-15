const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'essa', 'esse',
  'esta', 'este', 'eu', 'me', 'na', 'nas', 'no', 'nos', 'o', 'os', 'para', 'por', 'que', 'qual',
  'quais', 'se', 'sem', 'sobre', 'um', 'uma', 'você', 'vocês',
]);

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function queryTerms(query) {
  return [...new Set(normalizeText(query).split(/[^a-z0-9]+/).filter((term) => term.length > 1 && !STOP_WORDS.has(term)))];
}

function scoreArticle(article, terms) {
  const title = normalizeText(article.title);
  const summary = normalizeText(article.summary);
  const content = normalizeText(htmlToText(article.content));
  return terms.reduce((score, term) => score
    + (title.includes(term) ? 12 : 0)
    + (summary.includes(term) ? 5 : 0)
    + (content.includes(term) ? 1 : 0), 0);
}

function excerptFor(article, terms) {
  const text = htmlToText(article.content);
  const normalized = normalizeText(text);
  const positions = terms.map((term) => normalized.indexOf(term)).filter((position) => position >= 0);
  const position = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, position - 180);
  const excerpt = text.slice(start, start + 900).trim();
  return `${start > 0 ? '…' : ''}${excerpt}${start + 900 < text.length ? '…' : ''}`;
}

async function searchFaqArticles(query, limit = 6) {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const articles = await prisma.article.findMany({
    where: { status: 'published' },
    select: { id: true, title: true, slug: true, summary: true, content: true, category: true, updatedAt: true },
  });
  return articles
    .map((article) => ({ article, score: scoreArticle(article, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.article.updatedAt - a.article.updatedAt)
    .slice(0, Math.max(1, Math.min(Number(limit) || 6, 8)))
    .map(({ article, score }) => ({
      id: article.id,
      title: article.title,
      category: article.category,
      summary: article.summary,
      excerpt: excerptFor(article, terms),
      url: `/artigo/${article.slug}`,
      updatedAt: article.updatedAt.toISOString(),
      relevance: score,
    }));
}

module.exports = { htmlToText, normalizeText, queryTerms, scoreArticle, searchFaqArticles };
