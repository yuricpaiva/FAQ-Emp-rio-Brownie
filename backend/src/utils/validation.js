const VALID_ROLES = ['reader', 'creator', 'admin'];
const VALID_ARTICLE_STATUS = ['draft', 'published'];
const VALID_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VALID_WORD_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const VALID_WORD_EXTENSIONS = ['.docx'];

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value) {
  if (value === undefined) return undefined;
  return normalizeString(value);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function isValidHttpUrl(value) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function validateLoginInput(body = {}) {
  const email = normalizeString(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return { error: 'Email e senha são obrigatórios.' };
  }

  if (!isValidEmail(email)) {
    return { error: 'Email inválido.' };
  }

  return { value: { email, password } };
}

function validateArticleInput(body = {}) {
  const title = normalizeString(body.title);
  const slug = normalizeString(body.slug).toLowerCase();
  const summary = normalizeString(body.summary);
  const category = normalizeString(body.category);
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const status = normalizeString(body.status || 'draft').toLowerCase();
  const sortOrder = Number(body.sortOrder ?? 0);

  if (!title || !slug || !category || !content) {
    return { error: 'Título, slug, categoria e conteúdo são obrigatórios.' };
  }

  if (title.length > 160) {
    return { error: 'Título muito longo.' };
  }

  if (!isValidSlug(slug)) {
    return { error: 'Slug inválido. Use apenas letras minúsculas, números e hífens.' };
  }

  if (summary.length > 280) {
    return { error: 'Resumo muito longo.' };
  }

  if (!VALID_ARTICLE_STATUS.includes(status)) {
    return { error: 'Status inválido.' };
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    return { error: 'A ordem deve ser um número inteiro entre 0 e 9999.' };
  }

  if (category.length > 80) {
    return { error: 'Categoria muito longa.' };
  }

  return {
    value: {
      title,
      slug,
      summary,
      category,
      content,
      status,
      sortOrder
    }
  };
}

function validateCreateUserInput(body = {}) {
  const name = normalizeString(body.name);
  const email = normalizeString(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const role = normalizeString(body.role || 'reader');
  const photoUrl = normalizeOptionalString(body.photoUrl) || '';

  if (!name || !email || !password) {
    return { error: 'Nome, email e senha são obrigatórios.' };
  }

  if (!isValidEmail(email)) {
    return { error: 'Email inválido.' };
  }

  if (password.length < 6) {
    return { error: 'A senha deve ter pelo menos 6 caracteres.' };
  }

  if (!VALID_ROLES.includes(role)) {
    return { error: 'Permissão inválida.' };
  }

  if (!isValidHttpUrl(photoUrl)) {
    return { error: 'A foto precisa ser uma URL http/https válida.' };
  }

  return {
    value: {
      name,
      email,
      password,
      role,
      photoUrl
    }
  };
}

function validateSelfUserUpdateInput(body = {}) {
  const name = normalizeOptionalString(body.name);
  const email = normalizeOptionalString(body.email)?.toLowerCase();
  const password = typeof body.password === 'string' ? body.password : undefined;
  const photoUrl = normalizeOptionalString(body.photoUrl);

  if (name !== undefined && !name) {
    return { error: 'Nome inválido.' };
  }

  if (email !== undefined && !isValidEmail(email)) {
    return { error: 'Email inválido.' };
  }

  if (password !== undefined && password.length > 0 && password.length < 6) {
    return { error: 'A senha deve ter pelo menos 6 caracteres.' };
  }

  if (photoUrl !== undefined && !isValidHttpUrl(photoUrl)) {
    return { error: 'A foto precisa ser uma URL http/https válida.' };
  }

  return {
    value: {
      name,
      email,
      password,
      photoUrl
    }
  };
}

function validateAdminUserUpdateInput(body = {}) {
  const name = normalizeOptionalString(body.name);
  const email = normalizeOptionalString(body.email)?.toLowerCase();
  const password = typeof body.password === 'string' ? body.password : undefined;
  const photoUrl = normalizeOptionalString(body.photoUrl);
  const role = body.role !== undefined ? normalizeString(body.role) : undefined;
  const active = body.active;

  if (name !== undefined && !name) {
    return { error: 'Nome inválido.' };
  }

  if (email !== undefined && !isValidEmail(email)) {
    return { error: 'Email inválido.' };
  }

  if (password !== undefined && password.length > 0 && password.length < 6) {
    return { error: 'A senha deve ter pelo menos 6 caracteres.' };
  }

  if (photoUrl !== undefined && !isValidHttpUrl(photoUrl)) {
    return { error: 'A foto precisa ser uma URL http/https válida.' };
  }

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return { error: 'Permissão inválida.' };
  }

  if (active !== undefined && typeof active !== 'boolean') {
    return { error: 'O campo active deve ser booleano.' };
  }

  return {
    value: {
      name,
      email,
      password,
      photoUrl,
      role,
      active
    }
  };
}

function validateNumericId(rawId, fieldName = 'ID') {
  const id = Number(rawId);

  if (!Number.isInteger(id) || id <= 0) {
    return { error: `${fieldName} inválido.` };
  }

  return { value: id };
}

module.exports = {
  VALID_ROLES,
  VALID_ARTICLE_STATUS,
  VALID_IMAGE_MIME_TYPES,
  VALID_IMAGE_EXTENSIONS,
  VALID_WORD_MIME_TYPES,
  VALID_WORD_EXTENSIONS,
  validateLoginInput,
  validateArticleInput,
  validateCreateUserInput,
  validateSelfUserUpdateInput,
  validateAdminUserUpdateInput,
  validateNumericId
};
