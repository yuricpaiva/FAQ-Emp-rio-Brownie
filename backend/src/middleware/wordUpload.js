const multer = require('multer');
const path = require('path');
const { VALID_WORD_MIME_TYPES, VALID_WORD_EXTENSIONS } = require('../utils/validation');

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimeOk = VALID_WORD_MIME_TYPES.includes(file.mimetype);
  const extOk = VALID_WORD_EXTENSIONS.includes(ext);

  if (mimeOk && extOk) {
    cb(null, true);
    return;
  }

  cb(new Error('Apenas arquivos Word .docx sao permitidos.'));
};

module.exports = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});
