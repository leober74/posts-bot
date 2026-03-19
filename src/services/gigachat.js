const axios = require('axios');
const { Agent } = require('node:https');

console.log('✅ GigaChat module loaded (новый код с логами)');

const httpsAgent = new Agent({ rejectUnauthorized: false });

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  console.log('🔄 getAccessToken вызван');
  if (cachedToken && Date.now() < tokenExpiry) {
    console.log('🔑 Используем кешированный токен');
    return cachedToken;
  }

  const auth = Buffer.from(process.env.GIGACHAT_CREDENTIALS).toString('base64');
  console.log('🔑 Requesting token with auth (base64 start):', auth.substring(0, 30) + '...');

  try {
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
    console.log('✅ Token response status:', response.status);
    console.log('📦 Token response data:', response.data);
    cachedToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_at - Date.now()) - 60000;
    return cachedToken;
  } catch (error) {
    console.error('❌ Error getting token:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers,
    });
    throw error;
  }
}

async function generatePost(prompt) {
  console.log('📝 generatePost вызван с prompt:', prompt.substring(0, 100));
  try {
    const token = await getAccessToken();
    console.log('🔑 Токен получен, отправляем запрос к chat/completions');

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
    console.log('✅ GigaChat response status:', response.status);
    return response.data.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('❌ GigaChat API error (full):', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        data: error.config?.data ? JSON.parse(error.config.data) : null,
        headers: error.config?.headers
      }
    });
    throw error;
  }
}

async function regeneratePost(originalPrompt, userFeedback) {
  console.log('🔄 regeneratePost вызван');
  const newPrompt = `Исходный запрос: "${originalPrompt}". Пожелание пользователя: "${userFeedback}". Сгенерируй новый, улучшенный пост с учётом пожеланий.`;
  return generatePost(newPrompt);
}

module.exports = { generatePost, regeneratePost };
