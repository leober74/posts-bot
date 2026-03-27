const { generatePost, regeneratePost } = require('../services/gigachat');
const { User, Log, Generation } = require('../models/db');
const { createPaymentLink } = require('../services/payment');
const keyboards = require('../utils/keyboards');
const ru = require('../locales/ru.json');
const en = require('../locales/en.json');

// Временное хранилище сессий (в памяти)
const sessions = new Map();

function getLocale(langCode) {
  if (langCode === 'ru' || langCode === 'uk' || langCode === 'be') return ru;
  return en;
}

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

  // -------------------- ВОВЛЕЧЕНИЕ --------------------
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
    // handled in callback
  }

  if (session.step === 'awaiting_interests') {
    // handled in callback (multiple choice)
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
    await generatePosts(ctx, session);
    return;
  }

  // -------------------- БИЗНЕС-ВЕТКА (LTV-опрос) --------------------
  if (session.step === 'awaiting_business_product') {
    session.data.business_product = ctx.message.text;
    await sendLocalized(ctx, 'business_frequency_question', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: t.business_frequency_one, callback_data: 'freq_one' },
            { text: t.business_frequency_several, callback_data: 'freq_several' },
            { text: t.business_frequency_monthly, callback_data: 'freq_monthly' }
          ],
          [
            { text: t.business_frequency_quarterly, callback_data: 'freq_quarterly' },
            { text: t.business_frequency_subscription, callback_data: 'freq_subscription' }
          ]
        ]
      }
    });
    session.step = 'awaiting_business_freq';
    return;
  }

  if (session.step === 'awaiting_business_avg_check') {
    const avgCheck = parseFloat(ctx.message.text);
    if (isNaN(avgCheck)) {
      await ctx.reply('Пожалуйста, введите число.');
      return;
    }
    session.data.business_avg_check = avgCheck;
    await sendLocalized(ctx, 'business_loyalty', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: t.business_loyalty_yes, callback_data: 'loyalty_yes' },
            { text: t.business_loyalty_no, callback_data: 'loyalty_no' },
            { text: t.business_loyalty_planned, callback_data: 'loyalty_planned' }
          ]
        ]
      }
    });
    session.step = 'awaiting_business_loyalty';
    return;
  }

  if (session.step === 'awaiting_business_ltv_months') {
    const ltvMonths = parseFloat(ctx.message.text);
    if (isNaN(ltvMonths)) {
      await ctx.reply('Пожалуйста, введите число.');
      return;
    }
    session.data.business_ltv_months = ltvMonths;
    // Сохраняем бизнес-данные в БД (предполагаем поле business_data)
    try {
      await User.update(
        {
          business_data: {
            description: session.data.business_desc,
            product: session.data.business_product,
            frequency: session.data.business_freq,
            avg_check: session.data.business_avg_check,
            loyalty: session.data.business_loyalty,
            ltv_months: session.data.business_ltv_months
          }
        },
        { where: { telegram_id: ctx.from.id } }
      );
    } catch (err) {
      console.error('Ошибка сохранения бизнес-данных:', err);
    }
    await sendLocalized(ctx, 'business_thanks');
    await generatePosts(ctx, session);
    return;
  }
}

// --------------------------------------------------------------
// Обработчик callback-запросов
// --------------------------------------------------------------
async function handleCallback(ctx) {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  if (!session) return;
  const t = getLocale(session.lang);
  const data = ctx.callbackQuery.data;

  // Кнопки истории
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

  // Возраст
  if (session.step === 'awaiting_age') {
    session.data.age = data;
    await ctx.editMessageText(t.gender_prompt, { reply_markup: keyboards.gender() });
    session.step = 'awaiting_gender';
    await ctx.answerCbQuery();
    return;
  }

  // Пол
  if (session.step === 'awaiting_gender') {
    session.data.gender = data;
    await ctx.editMessageText(t.user_type_prompt, { reply_markup: keyboards.userType() });
    session.step = 'awaiting_user_type';
    await ctx.answerCbQuery();
    return;
  }

  // Тип пользователя
  if (session.step === 'awaiting_user_type') {
    session.data.user_type = data;
    if (data === 'personal') {
      await ctx.editMessageText(t.personal_interests_prompt, { reply_markup: keyboards.interests() });
      session.step = 'awaiting_interests';
    } else {
      // Бизнес-ветка: LTV-опрос
      await ctx.editMessageText(t.business_calc_prompt);
      await sendLocalized(ctx, 'business_product_question');
      session.step = 'awaiting_business_product';
    }
    await ctx.answerCbQuery();
    return;
  }

  // Частота покупок (бизнес)
  if (session.step === 'awaiting_business_freq') {
    session.data.business_freq = data;
    await ctx.editMessageText(t.business_avg_check);
    session.step = 'awaiting_business_avg_check';
    await ctx.answerCbQuery();
    return;
  }

  // Программа лояльности (бизнес)
  if (session.step === 'awaiting_business_loyalty') {
    session.data.business_loyalty = data;
    await ctx.editMessageText(t.business_ltv_months);
    session.step = 'awaiting_business_ltv_months';
    await ctx.answerCbQuery();
    return;
  }

  // Пропуск ключевых слов
  if (data === 'skip_keywords') {
    await ctx.editMessageText(t.profile_link_prompt);
    session.step = 'awaiting_profile_link';
    await ctx.answerCbQuery();
    return;
  }

  // Оценка поста
  if (data.startsWith('rate_')) {
    const rate = parseInt(data.split('_')[1]);
    const postIndex = session.data.currentPostIndex || 0;
    const post = session.data.posts[postIndex];
    if (post) {
      // Сохраняем оценку (можно в БД)
      if (rate <= 3) {
        await ctx.editMessageText(t.feedback_prompt);
        session.step = `awaiting_feedback_${postIndex}`;
      } else {
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

  // Следующий пост
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

  // Подписка
  if (data === 'subscribe') {
    const isRussian = session.lang === 'ru';
    if (isRussian) {
      const paymentLink = await createPaymentLink(userId, 100);
      await ctx.editMessageText(t.subscribe_link.replace('{link}', paymentLink));
    } else {
      // Для иностранцев пока заглушка
      await ctx.editMessageText('Payment will be available soon. Stay tuned!');
    }
    await ctx.answerCbQuery();
    return;
  }

  // Кнопки поддержки и вопросов
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

  // --- Кнопка курса OneShop ---
  if (data === 'oneshop_course') {
    await ctx.editMessageText(t.oneshop_course_info, { parse_mode: 'Markdown' });
    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ Я прошёл курс', callback_data: 'oneshop_course_done' }],
        [{ text: '🔙 Назад', callback_data: 'back_to_final' }]
      ]
    };
    await ctx.reply(t.oneshop_course_already_done, { reply_markup: keyboard });
    session.step = 'awaiting_course_screenshot';
    await ctx.answerCbQuery();
    return;
  }

  if (data === 'oneshop_course_done') {
    await ctx.editMessageText(t.oneshop_course_already_done);
    session.step = 'awaiting_course_screenshot';
    await ctx.answerCbQuery();
    return;
  }

  if (data === 'back_to_final') {
    await finishGeneration(ctx, session);
    await ctx.answerCbQuery();
    return;
  }
}

// --------------------------------------------------------------
// Обработчик фото (скриншот курса)
// --------------------------------------------------------------
async function handlePhoto(ctx) {
  const userId = ctx.from.id;
  const session = sessions.get(userId);
  if (!session) return;
  const t = getLocale(session.lang);

  if (session.step === 'awaiting_course_screenshot') {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    // В реальном проекте можно отправить файл на проверку (например, через AI), 
    // но для MVP достаточно просто отметить, что пользователь отправил фото.
    await User.update(
      { oneshop_course_completed: true },
      { where: { telegram_id: userId } }
    );
    await ctx.reply(t.oneshop_course_confirm);
    session.step = 'idle';
    // Возвращаем финальное меню
    await finishGeneration(ctx, session);
    return;
  }
}

// --------------------------------------------------------------
// Генерация постов
// --------------------------------------------------------------
async function generatePosts(ctx, session) {
  const t = getLocale(session.lang);
  await ctx.reply(t.generating);

  // Здесь должен быть реальный вызов AI. Вместо заглушки используйте свой код.
  // В качестве примера:
  const prompts = {
    selling: `Напиши продающий пост для соцсети ${session.data.social} на тему ${session.data.topic}. Аудитория: ${session.data.age}, ${session.data.gender}. Стиль: ${session.data.style || 'дружелюбный'}. Ключевые слова: ${session.data.keywords_selling || ''}. Используй структуру AIDA.`,
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
  await ctx.reply(t.publish_instructions);
}

async function finishGeneration(ctx, session) {
  const t = getLocale(session.lang);
  const keyboard = {
    inline_keyboard: [
      [{ text: t.subscription_button, callback_data: 'subscribe' }],
      [{ text: t.support_button, callback_data: 'contact_expert' }],
      [{ text: t.question_button, callback_data: 'ask_question' }]
    ]
  };
  await ctx.reply(t.final_message, { reply_markup: keyboard });

  const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
  if (user) {
    await ctx.reply(t.referral_message.replace('{link}', `https://t.me/${ctx.botInfo.username}?start=ref_${user.referral_code}`));
  }

  // Проверяем, не прошёл ли пользователь уже курс OneShop
  const userData = await User.findOne({ where: { telegram_id: ctx.from.id } });
  if (!userData?.oneshop_course_completed) {
    const courseKeyboard = {
      inline_keyboard: [
        [{ text: t.oneshop_course_button, callback_data: 'oneshop_course' }]
      ]
    };
    await ctx.reply(t.oneshop_course_offer, { reply_markup: courseKeyboard });
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
// Экспорт
// --------------------------------------------------------------
module.exports = {
  handleText,
  handleCallback,
  handlePhoto,
  startRegistration
};
