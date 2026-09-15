const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..', '..', 'ai-storage');

function getRoot() {
  const configured = String(process.env.AI_STORAGE_DIR || '').trim();
  return configured ? path.resolve(configured) : DEFAULT_ROOT;
}

function resolveStorageKey(storageKey) {
  const root = getRoot();
  if (!storageKey || typeof storageKey !== 'string' || path.isAbsolute(storageKey) || storageKey.includes('..')) {
    throw Object.assign(new Error('Arquivo do Browninho inválido.'), { status: 400 });
  }
  const filePath = path.resolve(root, ...storageKey.split('/'));
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw Object.assign(new Error('Arquivo do Browninho inválido.'), { status: 400 });
  }
  return filePath;
}

async function saveGeneratedImage(base64Data) {
  const buffer = Buffer.from(base64Data, 'base64');
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) {
    throw Object.assign(new Error('A imagem gerada possui tamanho inválido.'), { status: 502 });
  }
  const now = new Date();
  const storageKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.png`;
  const filePath = resolveStorageKey(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer, { flag: 'wx' });
  return { storageKey, size: buffer.length, mimeType: 'image/png' };
}

async function locateGeneratedFile(storageKey) {
  const filePath = resolveStorageKey(storageKey);
  await fs.access(filePath);
  return filePath;
}

async function removeGeneratedFiles(storageKeys) {
  await Promise.all((storageKeys || []).filter(Boolean).map(async (key) => {
    try { await fs.rm(resolveStorageKey(key), { force: true }); } catch { /* limpeza oportunista */ }
  }));
}

module.exports = { getRoot, locateGeneratedFile, removeGeneratedFiles, resolveStorageKey, saveGeneratedImage };
