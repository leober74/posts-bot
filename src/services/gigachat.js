const axios = require('axios');
const { Agent } = require('node:https');

const httpsAgent = new Agent({ rejectUnauthorized: false });

// GigaChat токен (русский)
let cachedGigaToken = null;
let gigaTokenExpiry = 0;

async function getGigaToken() {
  if (cachedGigaToken && Date.now() < gigaTokenExpiry) return cachedGigaToken;
  const auth = Buffer.from(process.env.GIGACHAT_CREDENTIALS).toString('base64');
  const response = await axios.post(
    'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    'scope=' + (process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS'),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`,
        'RqUID': '1'
      },
      httpsAgent,
      timeout: 30000
    }
  );
  cachedGigaToken = response.data.access_token;
  gigaTokenExpiry = Date.now() + (response.data.expires_at - Date.now()) - 60000;
  return cachedGigaToken;
}

// OpenAI (английский) — используем ключ из переменных
async function getOpenAIToken() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  return process.env.OPENAI_API_KEY;
}

async function callGigaChat(prompt) {
  const token = await getGigaToken();
  const response = await axios.post(
    'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    {
      model: process.env.GIGACHAT_MODEL || 'GigaChat',
      messages: [
        {
          role: 'system',
          content: 'Ты эксперт по нейромаркетингу. Пиши посты по структуре AIDA (крючок, проблема, решение, доказательства, призыв, вопрос). Используй только факты, не выдумывай. Ответ пиши на русском языке.',
        },
        { role: 'user', content: prompt },
      ],
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      httpsAgent,
      timeout: 60000,
    }
  );
  return response.data.choices[0]?.message?.content || '';
}

async function callOpenAI(prompt) {
  const apiKey = await getOpenAIToken();
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert in neuromarketing and copywriting. Write posts following the AIDA structure (Attention, Interest, Desire, Action). Use only facts, no fabrications. Answer in English.',
        },
        { role: 'user', content: prompt },
      ],
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );
  return response.data.choices[0]?.message?.content || '';
}

async function generatePost(prompt, language = 'ru') {
  try {
    if (language === 'ru') {
      return await callGigaChat(prompt);
    } else {
      return await callOpenAI(prompt);
    }
  } catch (error) {
    console.error(`AI error (${language}):`, error.response?.data || error.message);
    throw error;
  }
}

async function regeneratePost(originalPrompt, userFeedback, language = 'ru') {
  const newPrompt = `Original request: "${originalPrompt}". User feedback: "${userFeedback}". Generate an improved post.`;
  return generatePost(newPrompt, language);
}

module.exports = { generatePost, regeneratePost };
