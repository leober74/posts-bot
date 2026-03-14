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
  // expires_at приходит в миллисекундах, обновляем за 2 минуты до истечения
  tokenExpiry = response.data.expires_at
    ? response.data.expires_at - 120000
    : Date.now() + 28 * 60 * 1000; // fallback: 28 минут
  return accessToken;
}

function buildPrompt(postType, userData, regenCount = 0) {
  const { name, age, gender, interests, social_network, style, keywords, topic, user_type, business_desc } = userData;

  const lengthGuide = {
    'ВКонтакте': 'до 900 знаков',
    'Telegram': 'до 1400 знаков',
    'Instagram': 'до 2000 знаков',
  }[social_network] || 'до 1200 знаков';

  const postTypeGoals = {
    'продающий': 'убедить читателя сделать конкретное действие (написать, подписаться, попробовать)',
    'развлекательный': 'вызвать эмоцию, улыбку или желание поделиться постом',
    'экспертный': 'показать глубокое понимание темы, дать реальную пользу читателю',
    'вовлекающий': 'запустить живое обсуждение, получить комментарии и реакции'
  };

  // Разные структурные форматы — меняются при перегенерации
  const structures = [
    `Структура:
1. ЖИРНЫЙ заголовок поста — короткий, цепляющий, отражает суть (напиши его первой строкой, выдели **жирным**)
2. Открой историей или неожиданным фактом — читатель должен узнать себя
3. Разверни проблему и покажи выход через личный опыт автора
4. Один конкретный факт или цифра для убедительности
5. Простой призыв к действию
6. Вопрос в конце для вовлечения`,

    `Структура:
1. ЖИРНЫЙ заголовок — провокационный вопрос или смелое утверждение (первая строка, **жирным**)
2. Начни с парадокса или противоречия — то что удивляет
3. Короткая личная история (2-3 предложения) — живая и конкретная
4. Главный инсайт или вывод
5. Что читатель может сделать прямо сейчас
6. Открытый вопрос читателям`,

    `Структура:
1. ЖИРНЫЙ заголовок — обещание пользы или интриги (первая строка, **жирным**)
2. Сразу обозначь боль или ситуацию которую знает каждый
3. Три коротких пункта или наблюдения (можно через эмодзи)
4. Личное мнение или позиция автора
5. Призыв к действию — конкретный и без давления
6. Вопрос который хочется обсудить`
  ];

  const structure = structures[regenCount % structures.length];

  let audienceBlock = '';
  if (user_type === 'personal') {
    audienceBlock = `Пишет человек: возраст ${age || '25-35'}, пол ${gender || 'не указан'}, интересы: ${interests || 'саморазвитие, доход'}.`;
  } else {
    audienceBlock = `Автор — владелец бизнеса: ${business_desc || 'малый бизнес'}. Цель постов — привлечение партнёров и агентов для масштабирования продаж.`;
  }

  const partnerNote = user_type === 'business'
    ? 'Делай акцент на возможности для партнёров: доход, независимость, масштабирование. Предложение стать частью команды, а не просто реклама.'
    : '';

  return `Ты — топовый копирайтер для соцсетей. Пишешь живо, как настоящий человек — без шаблонов и корпоративного языка.

ЗАДАЧА: написать ${postType} пост для ${social_network || 'Telegram'} на тему "${topic}".
ЦЕЛЬ ПОСТА: ${postTypeGoals[postType]}.

${audienceBlock}
Автора зовут ${name || 'автор'}. Стиль: ${style || 'дружелюбный, живой'}.
${keywords ? `Идея автора: «${keywords}» — это основа, разверни её интересно.` : ''}
${partnerNote}

${structure}

ЖЁСТКИЕ ЗАПРЕТЫ:
- НИКАКИХ подписей к структуре: не пиши "Крючок:", "Проблема:", "Решение:", "Доказательство:", "Призыв:", "Вопрос:" и любые другие метки — текст должен течь естественно
- НИКАКИХ выдуманных материалов: не упоминай чеклисты, PDF, гайды, ссылки которых нет
- НИКАКИХ штампов: "в мире где...", "каждый из нас...", "наверное ты знаешь..."
- Призыв к действию только реальный: написать в личку, подписаться, оставить комментарий

Длина: ${lengthGuide}. Пиши так чтобы хотелось дочитать до конца.

Верни ТОЛЬКО текст поста. Без вводных слов, без "Вот пост:", без пояснений.`;
}

async function generatePost(postType, userData, regenCount = 0) {
  const token = await getAccessToken();
  const prompt = buildPrompt(postType, userData, regenCount);

  const response = await axios.post(
    'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    {
      model: 'GigaChat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85 + (regenCount * 0.05), // каждый раз чуть больше свободы
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

async function regeneratePost(postType, userData, feedback, regenCount = 1) {
  const token = await getAccessToken();
  const basePrompt = buildPrompt(postType, userData, regenCount);
  const fullPrompt = `${basePrompt}\n\nВАЖНО: Предыдущий вариант не подошёл. Причина: "${feedback}".\nНапиши ПРИНЦИПИАЛЬНО ДРУГОЙ вариант — другое начало, другой угол подачи, другие примеры. Не повторяй предыдущую структуру.`;

  const response = await axios.post(
    'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    {
      model: 'GigaChat',
      messages: [{ role: 'user', content: fullPrompt }],
      temperature: 0.9 + (regenCount * 0.05),
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
