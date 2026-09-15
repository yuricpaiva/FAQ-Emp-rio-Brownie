const multer = require('multer');
const path = require('path');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.xls', '.xlsx', '.csv', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/octet-stream',
]);

const aiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 6, fields: 10 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())) {
      callback(new Error('Formato de arquivo não permitido no Browninho.'));
      return;
    }
    callback(null, true);
  },
});

module.exports = { aiUpload, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES };
