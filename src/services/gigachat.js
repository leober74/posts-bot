const axios = require('axios');

let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const credentials = Buffer.from(
    `${process.env.GIGACHAT_CLIENT_ID}:${process.env.GIGACHAT_CLIENT_SECRET}`
  ).toString('base64');

  const response = await axios.post(
    'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    'scope=GIGACHAT_API_PERS',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'RqUID': require('crypto').randomUUID()
      },
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_at - 60) * 1000;
  return accessToken;
}

function buildPrompt(postType, userData) {
  const { name, age, gender, interests, social_network, style, keywords, topic, user_type, business_desc } = userData;

  const lengthGuide = {
    'ВКонтакте': 'до 1000 знаков',
    'Telegram': 'до 1500 знаков',
    'Instagram': 'до 2200 знаков',
    'Другое': 'до 1200 знаков'
  }[social_network] || 'до 1200 знаков';

  const postTypeDescriptions = {
    'продающий': 'продающий — убеждает купить/подписаться/связаться',
    'развлекательный': 'развлекательный — вовлекает, вызывает реакцию, делится',
    'экспертный': 'экспертный — показывает компетентность, даёт пользу',
    'вовлекающий': 'вовлекающий — задаёт вопрос, запускает обсуждение'
  };

  let audienceBlock = '';
  if (user_type === 'personal') {
    audienceBlock = `Целевая аудитория автора: возраст ${age}, пол ${gender}, интересы: ${interests || 'разные'}.`;
  } else {
    audienceBlock = `Бизнес автора: ${business_desc || 'малый бизнес'}. Цель постов — привлечение партнёров и агентов для масштабирования продаж.`;
  }

  const partnerNote = user_type === 'business'
    ? 'Делай акцент на возможности для партнёров: доход, независимость, масштабирование. Не просто продажи, а предложение стать частью команды.'
    : '';

  return `Ты — эксперт по нейромаркетингу и копирайтингу для социальных сетей.

Напиши ${postTypeDescriptions[postType]} пост для ${social_network} на тему "${topic}".

${audienceBlock}

Автора зовут ${name || 'автор'}. Тон и стиль: ${style || 'дружелюбный'}.
${keywords ? `Обязательно используй ключевые слова: ${keywords}.` : ''}
${partnerNote}

Структура AIDA обязательна:
1. Крючок (первые 1-2 строки — зацепить внимание)
2. Проблема (боль аудитории)
3. Решение (что предлагает автор)
4. Доказательства (факт, история, цифра)
5. Призыв к действию (конкретный)
6. Вовлекающий вопрос в конце

Длина: ${lengthGuide}. Не используй шаблонные фразы типа "В мире современных реалий". Пиши живо, как реальный человек.

Верни ТОЛЬКО текст поста, без пояснений, без заголовков вроде "Вот пост:".`;
}

async function generatePost(postType, userData) {
  const token = await getAccessToken();
  const prompt = buildPrompt(postType, userData);

  const response = await axios.post(
    'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    {
      model: 'GigaChat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      max_tokens: 1000
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    }
  );

  return response.data.choices[0].message.content.trim();
}

async function regeneratePost(postType, userData, feedback) {
  const token = await getAccessToken();
  const basePrompt = buildPrompt(postType, userData);
  const fullPrompt = `${basePrompt}\n\nВАЖНО: Предыдущий вариант не понравился. Причина: "${feedback}". Учти это и напиши ДРУГОЙ вариант.`;

  const response = await axios.post(
    'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    {
      model: 'GigaChat',
      messages: [{ role: 'user', content: fullPrompt }],
      temperature: 0.95,
      max_tokens: 1000
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    }
  );

  return response.data.choices[0].message.content.trim();
}

module.exports = { generatePost, regeneratePost };
