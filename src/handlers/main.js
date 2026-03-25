const { generatePost, regeneratePost } = require('../services/gigachat');
const { User, Log, Generation, Payment } = require('../models/db');
const { createPaymentLink, handlePaymentWebhook } = require('../services/payment');
const keyboards = require('../utils/keyboards');
const ru = require('../locales/ru.json');
const en = require('../locales/en.json');

// Хранилище сессий (в памяти)
const sessions = new Map();

function getLocale(langCode) {
  if (langCode === 'ru' || langCode === 'uk' || langCode === 'be') return ru;
  return en;
}

// --------------------------------------------------------------
// Вспомогательная функция для отправки локализованного сообщения
// --------------------------------------------------------------
async function sendLocalized(ctx, key, options = {}) {
  const t = getLocale(ctx.from.language_code || 'en');
  const text = t[key];
  if (!text) {
    console.warn(`Missing translation key: ${key}`);
    await ctx.reply('Error: missing text');
    return;
  }
  await ctx.reply(text, options);
}

// --------------------------------------------------------------
// Обработчик текстовых сообщений
// --------------------------------------------------------------
async function handleText(ctx) {
  const userId = ctx.from.id;
  let session = sessions.get(userId);
  const lang = ctx.from.language_code || 'en';
  const t = getLocale(lang);

  if (!session) {
    session = { step: 'start', data: {} };
    sessions.set(userId, session);
  }
  session.lang = lang;

  // -------------------- ВОВЛЕЧЕНИЕ (калькулятор + история) --------------------
  if (session.step === 'start') {
    await sendLocalized(ctx, 'welcome');
    await sendLocalized(ctx, 'ask_hours');
    session.step = 'awaiting_hours';
    return;
  }

  if (session.step === 'awaiting_hours') {
    const hours = parseInt(ctx.message.text);
    if (isNaN(hours)) {
      await ctx.reply('Пожалуйста, введите число.');
      return;
    }
    session.data.hours = hours;
    await sendLocalized(ctx, 'ask_hour_rate');
    session.step = 'awaiting_rate';
    return;
  }

  if (session.step === 'awaiting_rate') {
    const rate = parseInt(ctx.message.text);
    if (isNaN(rate)) {
      await ctx.reply('Пожалуйста, введите число.');
      return;
    }
    session.data.rate = rate;
    const loss = (session.data.hours * session.data.rate * 4).toFixed(0);
    await ctx.reply(t.loss_calculation.replace('{loss}', loss));
    await sendLocalized(ctx, 'intro_story');
    const keyboard = {
      inline_keyboard: [
        [
          { text: t.story_yes, callback_data: 'story_yes' },
          { text: t.story_no, callback_data: 'story_no' }
        ]
      ]
    };
    await sendLocalized(ctx, 'story_question', { reply_markup: keyboard });
    session.step = 'awaiting_story';
    return;
  }

  if (session.step === 'awaiting_blocker') {
    // Сохраняем причину в лог
    await Log.create({ telegram_id: userId, event: 'blocker', details: { text: ctx.message.text } });
    await sendLocalized(ctx, 'blocker_thanks');
    session.step = 'registration';
    await startRegistration(ctx, session);
    return;
  }

  // -------------------- РЕГИСТРАЦИЯ --------------------
  if (session.step === 'awaiting_name') {
    session.data.name = ctx.message.text;
    await sendLocalized(ctx, 'age_prompt', { reply_markup: keyboards.age() });
    session.step = 'awaiting_age';
    return;
  }

  if (session.step === 'awaiting_gender') {
    // обрабатывается в callback
  }

  if (session.step === 'awaiting_interests') {
    // обработка интересов (множественный выбор) – предполагается, что вы уже умеете это делать
    // в вашем коде, просто сохраните выбранные интересы в session.data.interests
    // и после нажатия "Готово" переходите к выбору темы
    // Пример:
    // session.data.interests = [ ... ];
    // session.step = 'awaiting_topic';
    // await sendLocalized(ctx, 'topic_prompt', { reply_markup: keyboards.topics() });
  }

  if (session.step === 'awaiting_topic') {
    session.data.topic = ctx.message.text;
    await sendLocalized(ctx, 'social_prompt', { reply_markup: keyboards.socials() });
    session.step = 'awaiting_social';
    return;
  }

  if (session.step === 'awaiting_social') {
    session.data.social = ctx.message.text;
    await sendLocalized(ctx, 'style_prompt');
    session.step = 'awaiting_style_examples';
    return;
  }

  if (session.step === 'awaiting_style_examples') {
    if (ctx.message.text.toLowerCase() === 'нет' || ctx.message.text.toLowerCase() === 'skip') {
      await sendLocalized(ctx, 'style_choice_prompt', { reply_markup: keyboards.styles() });
      session.step = 'awaiting_style_choice';
    } else {
      session.data.style_examples = ctx.message.text;
      await sendLocalized(ctx, 'keywords_prompt', { reply_markup: { inline_keyboard: [[{ text: '⏭ Пропустить всё', callback_data: 'skip_keywords' }]] } });
      session.step = 'awaiting_keywords_selling';
    }
    return;
  }

  if (session.step === 'awaiting_style_choice') {
    session.data.style = ctx.message.text;
    await sendLocalized(ctx, 'keywords_prompt', { reply_markup: { inline_keyboard: [[{ text: '⏭ Пропустить всё', callback_data: 'skip_keywords' }]] } });
    session.step = 'awaiting_keywords_selling';
    return;
  }

  // Сбор ключевых слов (последовательно)
  if (session.step === 'awaiting_keywords_selling') {
    session.data.keywords_selling = ctx.message.text;
    await sendLocalized(ctx, 'keywords_entertaining');
    session.step = 'awaiting_keywords_entertaining';
    return;
  }
  if (session.step === 'awaiting_keywords_entertaining') {
    session.data.keywords_entertaining = ctx.message.text;
    await sendLocalized(ctx, 'keywords_expert');
    session.step = 'awaiting_keywords_expert';
    return;
  }
  if (session.step === 'awaiting_keywords_expert') {
    session.data.keywords_expert = ctx.message.text;
    await sendLocalized(ctx, 'keywords_engaging');
    session.step = 'awaiting_keywords_engaging';
    return;
  }
  if (session.step === 'awaiting_keywords_engaging') {
    session.data.keywords_engaging = ctx.message.text;
    await sendLocalized(ctx, 'profile_link_prompt');
    session.step = 'awaiting_profile_link';
    return;
  }

  if (session.step === 'awaiting_profile_link') {
    session.data.profile_link = ctx.message.text;
    // валидация не обязательна, можно пропустить
    await generatePosts(ctx, session);
    return;
  }

  // -------------------- БИЗНЕС-ВЕТКА (упрощённо) --------------------
  if (session.step === 'awaiting_business_desc') {
    session.data.business_desc = ctx.message.text;
    await sendLocalized(ctx, 'business_frequency', { reply_markup: keyboards.businessFreq() });
    session.step = 'awaiting_business_freq';
    return;
  }

  if (session.step === 'awaiting_business_freq') {
    session.data.business_freq = ctx.message.text;
    // после этого можно сразу генерировать посты для бизнеса
    await generatePosts(ctx, session);
    return;
  }
}

// --------------------------------------------------------------
// Обработчик callback-запросов (кнопки)
// --------------------------------------------------------------
async function handleCallback(ctx) {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  if (!session) return;
  const t = getLocale(session.lang);

  const data = ctx.callbackQuery.data;

  // --- обработка кнопок истории ---
  if (session.step === 'awaiting_story') {
    if (data === 'story_yes') {
      await ctx.editMessageText(t.ask_blocker);
      session.step = 'awaiting_blocker';
    } else {
      await ctx.editMessageText(t.story_skip);
      session.step = 'registration';
      await startRegistration(ctx, session);
    }
    await ctx.answerCbQuery();
    return;
  }

  // --- возраст ---
  if (session.step === 'awaiting_age') {
    session.data.age = data;
    await ctx.editMessageText(t.gender_prompt, { reply_markup: keyboards.gender() });
    session.step = 'awaiting_gender';
    await ctx.answerCbQuery();
    return;
  }

  // --- пол ---
  if (session.step === 'awaiting_gender') {
    session.data.gender = data;
    await ctx.editMessageText(t.user_type_prompt, { reply_markup: keyboards.userType() });
    session.step = 'awaiting_user_type';
    await ctx.answerCbQuery();
    return;
  }

  // --- тип пользователя ---
  if (session.step === 'awaiting_user_type') {
    session.data.user_type = data;
    if (data === 'personal') {
      await ctx.editMessageText(t.personal_interests_prompt, { reply_markup: keyboards.interests() });
      session.step = 'awaiting_interests';
    } else {
      await ctx.editMessageText(t.business_intro);
      session.step = 'awaiting_business_desc';
    }
    await ctx.answerCbQuery();
    return;
  }

  // --- интересы (мультивыбор) – здесь нужна ваша логика, у меня пример ---
  if (session.step === 'awaiting_interests') {
    // если data начинается с 'interest_', то добавляем/удаляем
    // в конце – кнопка "Готово"
    if (data === 'interests_done') {
      // сохраняем выбранные интересы (session.data.interests) и переходим к теме
      await ctx.editMessageText(t.topic_prompt, { reply_markup: keyboards.topics() });
      session.step = 'awaiting_topic';
    } else {
      // переключаем интерес (сохраняем в сессии)
      //...
    }
    await ctx.answerCbQuery();
    return;
  }

  // --- тема ---
  if (session.step === 'awaiting_topic') {
    session.data.topic = data;
    await ctx.editMessageText(t.social_prompt, { reply_markup: keyboards.socials() });
    session.step = 'awaiting_social';
    await ctx.answerCbQuery();
    return;
  }

  // --- соцсеть ---
  if (session.step === 'awaiting_social') {
    session.data.social = data;
    await ctx.editMessageText(t.style_prompt);
    session.step = 'awaiting_style_examples';
    await ctx.answerCbQuery();
    return;
  }

  // --- стиль (если выбрал из кнопок) ---
  if (session.step === 'awaiting_style_choice') {
    session.data.style = data;
    await ctx.editMessageText(t.keywords_prompt, { reply_markup: { inline_keyboard: [[{ text: '⏭ Пропустить всё', callback_data: 'skip_keywords' }]] } });
    session.step = 'awaiting_keywords_selling';
    await ctx.answerCbQuery();
    return;
  }

  // --- пропуск ключевых слов ---
  if (data === 'skip_keywords') {
    await ctx.editMessageText(t.profile_link_prompt);
    session.step = 'awaiting_profile_link';
    await ctx.answerCbQuery();
    return;
  }

  // --- оценка поста (1-5) ---
  if (data.startsWith('rate_')) {
    const rate = parseInt(data.split('_')[1]);
    const postIndex = session.data.currentPostIndex || 0;
    const post = session.data.posts[postIndex];
    if (post) {
      // сохраняем оценку в БД (можно в Generation)
      if (rate <= 3) {
        // запрашиваем фидбек
        await ctx.editMessageText(t.feedback_prompt);
        session.step = `awaiting_feedback_${postIndex}`;
      } else {
        // хорошая оценка, показываем инструкцию и переходим к следующему
        await showPostInstructions(ctx, session, postIndex);
        if (postIndex + 1 < session.data.posts.length) {
          session.data.currentPostIndex = postIndex + 1;
          await showPost(ctx, session, session.data.currentPostIndex);
        } else {
          await finishGeneration(ctx, session);
        }
      }
    }
    await ctx.answerCbQuery();
    return;
  }

  // --- следующий пост (если оценка была 4-5 и пользователь нажал кнопку) ---
  if (data === 'next_post') {
    const postIndex = session.data.currentPostIndex + 1;
    if (postIndex < session.data.posts.length) {
      session.data.currentPostIndex = postIndex;
      await showPost(ctx, session, postIndex);
    } else {
      await finishGeneration(ctx, session);
    }
    await ctx.answerCbQuery();
    return;
  }

  // --- кнопки подписки, вопрос, связаться ---
  if (data === 'subscribe') {
    // создаём платёж через Точку или Stripe в зависимости от страны
    const paymentLink = await createPaymentLink(userId, 100, session.lang);
    await ctx.editMessageText(t.subscribe_link.replace('{link}', paymentLink));
    session.step = 'waiting_payment';
    await ctx.answerCbQuery();
    return;
  }

  if (data === 'contact_expert') {
    await ctx.editMessageText(t.contact_expert);
    session.step = 'awaiting_contact';
    await ctx.answerCbQuery();
    return;
  }

  if (data === 'ask_question') {
    await ctx.editMessageText(t.ask_question);
    session.step = 'awaiting_question';
    await ctx.answerCbQuery();
    return;
  }
}

// --------------------------------------------------------------
// Генерация постов
// --------------------------------------------------------------
async function generatePosts(ctx, session) {
  const t = getLocale(session.lang);
  await ctx.reply(t.generating);

  const prompts = {
    selling: `Напиши продающий пост для соцсети ${session.data.social} на тему ${session.data.topic}. Аудитория: ${session.data.age}, ${session.data.gender}. Стиль: ${session.data.style || 'дружелюбный'}. Ключевые слова: ${session.data.keywords_selling || ''}. Используй структуру AIDA. Длина: до 1000 знаков.`,
    entertaining: `Напиши развлекательный пост...`,
    expert: `Напиши экспертный пост...`,
    engaging: `Напиши вовлекающий пост...`
  };

  const posts = [];
  for (const type of ['selling', 'entertaining', 'expert', 'engaging']) {
    try {
      const content = await generatePost(prompts[type], session.lang);
      posts.push({ type, content });
    } catch (err) {
      await ctx.reply(t.error_gigachat);
      return;
    }
  }

  session.data.posts = posts;
  session.data.currentPostIndex = 0;
  await showPost(ctx, session, 0);
}

async function showPost(ctx, session, index) {
  const t = getLocale(session.lang);
  const post = session.data.posts[index];
  const postTypeKey = `post_type_${post.type}`;
  const typeText = t[postTypeKey] || post.type;

  await ctx.reply(`📝 ${typeText} — вариант 1\n\n${post.content}`);
  const keyboard = {
    inline_keyboard: [
      [{ text: '1😞', callback_data: 'rate_1' }, { text: '2🤔', callback_data: 'rate_2' }, { text: '3✏️', callback_data: 'rate_3' }, { text: '4😊', callback_data: 'rate_4' }, { text: '5🔥', callback_data: 'rate_5' }]
    ]
  };
  await ctx.reply(t.rating_prompt, { reply_markup: keyboard });
}

async function showPostInstructions(ctx, session, index) {
  const t = getLocale(session.lang);
  const post = session.data.posts[index];
  // здесь можно показать инструкцию по публикации для выбранной соцсети
  await ctx.reply(t.publish_instructions);
}

async function finishGeneration(ctx, session) {
  const t = getLocale(session.lang);
  // финальный экран с кнопками подписки, реферальной ссылкой
  const keyboard = {
    inline_keyboard: [
      [{ text: t.subscription_button, callback_data: 'subscribe' }],
      [{ text: t.support_button, callback_data: 'contact_expert' }],
      [{ text: t.question_button, callback_data: 'ask_question' }]
    ]
  };
  await ctx.reply(t.final_message, { reply_markup: keyboard });
  // также показываем реферальную ссылку
  const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
  if (user) {
    await ctx.reply(t.referral_message.replace('{link}', `https://t.me/${ctx.botInfo.username}?start=ref_${user.referral_code}`));
  }
  session.step = 'idle';
}

// --------------------------------------------------------------
// Начало регистрации
// --------------------------------------------------------------
async function startRegistration(ctx, session) {
  const t = getLocale(session.lang);
  await ctx.reply(t.name_prompt);
  session.step = 'awaiting_name';
}

// --------------------------------------------------------------
// Экспорт для index.js
// --------------------------------------------------------------
module.exports = {
  handleText,
  handleCallback,
  startRegistration
};
