const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { VALID_IMAGE_MIME_TYPES, VALID_IMAGE_EXTENSIONS } = require('../utils/validation');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${unique}${ext}`);
  }
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimeOk = VALID_IMAGE_MIME_TYPES.includes(file.mimetype);
  const extOk = VALID_IMAGE_EXTENSIONS.includes(ext);

  if (mimeOk && extOk) {
    cb(null, true);
    return;
  }

  cb(new Error('Apenas imagens JPG, PNG, WEBP e GIF são permitidas.'));
};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});
