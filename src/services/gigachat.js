// src/services/gigachat.js
const axios = require('axios');
const https = require('https');

const {
  GIGACHAT_CLIENT_ID,
  GIGACHAT_CLIENT_SECRET,
  GIGACHAT_SCOPE,
  GIGACHAT_MODEL
} = process.env;

let cachedToken = null;
let tokenExpiresAt = 0;

// Получение токена
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const resp = await axios.post(
    'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    null,
    {
      params: {
        scope: GIGACHAT_SCOPE || 'GIGACHAT_API_PERS'
      },
      auth: {
        username: GIGACHAT_CLIENT_ID,
        password: GIGACHAT_CLIENT_SECRET
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    }
  );

  cachedToken = resp.data.access_token;
  tokenExpiresAt = now + 25 * 60 * 1000;

  return cachedToken;
}

// Вызов GigaChat
async function callGigaChat(prompt) {
  const token = await getAccessToken();

  const resp = await axios.post(
    'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    {
      model: GIGACHAT_MODEL || 'GigaChat',
      messages: [
        { role: 'system', content: 'Ты пишешь посты для соцсетей на русском языке.' },
        { role: 'user', content: prompt }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    }
  );

  return resp.data.choices?.[0]?.message?.content?.trim() || '';
}

// Генерация поста
async function generatePost(prompt) {
  return await callGigaChat(prompt);
}

// Перегенерация
async function regeneratePost(type, userData, feedback, regenCount) {
  const prompt = `
Перегенерируй ${type} пост.
Данные пользователя: ${JSON.stringify(userData, null, 2)}
Пожелания: "${feedback}"
Попытка №${regenCount}
  `;
  return await callGigaChat(prompt);
}

module.exports = { generatePost, regeneratePost };
