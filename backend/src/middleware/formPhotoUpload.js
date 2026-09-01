const multer = require('multer');

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(allowed.has(file.mimetype) ? null : new Error('Apenas fotos JPEG, PNG ou WebP são permitidas.'), allowed.has(file.mimetype)),
});
