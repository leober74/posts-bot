const axios = require('axios');
const { Agent } = require('node:https');

const httpsAgent = new Agent({ rejectUnauthorized: false });

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

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
    }
  );

  cachedToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_at - Date.now()) - 60000;
  return cachedToken;
}

async function generatePost(prompt) {
  try {
    const token = await getAccessToken();
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
        timeout: 30000,
      }
    );
    return response.data.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('GigaChat API error:', error.response?.data || error.message);
    throw error;
  }
}

async function regeneratePost(originalPrompt, userFeedback) {
  const newPrompt = `Исходный запрос: "${originalPrompt}". Пожелание пользователя: "${userFeedback}". Сгенерируй новый, улучшенный пост с учётом пожеланий.`;
  return generatePost(newPrompt);
}

module.exports = { generatePost, regeneratePost };
