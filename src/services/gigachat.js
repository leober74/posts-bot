// src/services/gigachat.js
const axios = require('axios');

const {
  GIGACHAT_CLIENT_ID,
  GIGACHAT_CLIENT_SECRET,
  GIGACHAT_SCOPE,
  GIGACHAT_MODEL,
  GIGACHAT_API_PERS,
  GIGACHAT_VERIFY_SSL_CERTS
} = process.env;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) {
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
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: GIGACHAT_VERIFY_SSL_CERTS !== 'false'
      })
    }
  );

  cachedToken = resp.data.access_token;
  tokenExpiresAt = now + (resp.data.expires_at ? resp.data.expires_at * 1000 : 25 * 60 * 1000);
  return cachedToken;
}

async function callGigaChat(prompt) {
  const token = await getAccessToken();

  const resp = await axios.post(
    'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    {
      model: GIGACHAT_MODEL || 'GigaChat',
      messages: [
        { role: 'system', content: 'Ты помогаешь писать посты для соцсетей на русском языке.' },
        { role: 'user', content: prompt }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: GIGACHAT_VERIFY_SSL_CERTS !== 'false'
      })
    }
  );

  const choice = resp.data.choices?.[0];
  return choice?.message?.content?.trim() || '';
}

async function generatePost(prompt) {
  console.log('generatePost: отправляю запрос в GigaChat');
  const text = await callGigaChat(prompt);
  if (!text) {
    throw new Error('Пустой ответ GigaChat');
  }
  return text;
}

// если у тебя есть regeneratePost / synthesizeTopic — реализуй их аналогично
async function regeneratePost(type, userData, feedback, regenCount) {
  const prompt = `Перегенерируй ${type} пост для соцсетей. 
Учитывай данные о пользователе: ${JSON.stringify(userData, null, 2)}.
Учитывай пожелания: "${feedback}".
Это попытка №${regenCount}.`;
  return await callGigaChat(prompt);
}

module.exports = { generatePost, regeneratePost };
