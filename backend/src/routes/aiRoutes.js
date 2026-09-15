const { Router } = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/authAdmin');
const { aiUpload } = require('../middleware/aiUpload');
const { deleteConversation, getAttachmentContent, getConfig, listConversations, sendMessage, updateConversation } = require('../controllers/aiController');

const router = Router();
router.use(authenticate);
router.get('/config', getConfig);
router.get('/conversations', listConversations);
router.patch('/conversations/:id', updateConversation);
router.delete('/conversations/:id', deleteConversation);
router.get('/attachments/:id/content', getAttachmentContent);
router.post('/messages', (req, res) => {
  aiUpload.array('files', 6)(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'Cada arquivo deve ter no máximo 10 MB.' : 'Não foi possível receber os arquivos.';
      return res.status(400).json({ error: message });
    }
    if (error) return res.status(400).json({ error: error.message || 'Arquivo inválido.' });
    return sendMessage(req, res);
  });
});

module.exports = router;
