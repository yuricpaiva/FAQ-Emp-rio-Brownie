const { OpenAI, toFile } = require('openai');

let cachedClient;
let cachedKey = '';

class AiConfigurationError extends Error {
  constructor(message = 'A chave da OpenAI ainda não foi configurada.') {
    super(message);
    this.name = 'AiConfigurationError';
    this.status = 503;
    this.code = 'OPENAI_NOT_CONFIGURED';
  }
}

function getOpenAIClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new AiConfigurationError();
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new OpenAI({ apiKey, timeout: 120000, maxRetries: 2 });
    cachedKey = apiKey;
  }
  return cachedClient;
}

module.exports = { AiConfigurationError, getOpenAIClient, toFile };
