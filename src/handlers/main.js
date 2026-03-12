const { getState, setState, setStep, getStep } = require('../services/state');
const db = require('../models/db');
const { generatePost, regeneratePost } = require('../services/gigachat');
const kb = require('../utils/keyboards');

const POST_TYPES = ['продающий', 'развлекательный', 'экспертный', 'вовлекающий'];

const TOPIC_LABELS = {
  topic_economy: 'Экономия и скидки',
  topic_income: 'Дополнительный доход',
  topic_invest: 'Инвестиции',
  topic_tech: 'IT и нейросети',
  topic_health: 'Здоровье и красота',
  topic_home: 'Дом и семья',
  topic_auto: 'Авто и недвижимость'
};

// ─── /start ───────────────────────────────────────────────
async function handleStart(ctx) {
  const telegramId = ctx.from.id;
  const username = ctx.from.username;

  // Обработка реферальной ссылки
  const startPayload = ctx.message?.text?.split(' ')[1];
  if (startPayload && startPayload.startsWith('ref_')) {
    const referrer = db.getUserByRefCode(startPayload);
    if (referrer && String(referrer.telegram_id) !== String(telegramId)) {
      setState(telegramId, { referred_by: startPayload });
    }
  }

  db.createUser(telegramId, username);

  await ctx.reply(
    `Привет! Давай честно: бывает, что ты садишься писать пост, смотришь на пустой экран и не знаешь, с чего начать? Или тратишь 2 часа, а результат всё равно не нравится? А может, ты вообще не публикуешь, потому что «всё равно никто не прочитает»?\n\nЗнаешь, в чём проблема? Часто мы пытаемся писать «красиво», а не про то, что действительно волнует нашу аудиторию.\n\nЯ здесь, чтобы снять с тебя эту головную боль. Ты просто расскажешь мне, о чём хочешь написать и для кого, а я сделаю пост, который захочешь опубликовать сам.\n\nГотов? Погнали! 🚀`,
    kb.typeKeyboard
  );
  setStep(telegramId, 'choose_type');
}

// ─── Выбор типа ───────────────────────────────────────────
async function handleTypeChoice(ctx, userType) {
  const telegramId = ctx.from.id;
  db.updateUser(telegramId, { user_type: userType });
  setState(telegramId, { user_type: userType });

  if (userType === 'personal') {
    await ctx.editMessageText(
      '🔹 Отлично! Будем развивать твой личный бренд.\n\nКак тебя зовут? (напиши своё имя)'
    );
    setStep(telegramId, 'ask_name');
  } else {
    // Бизнес — начинаем квалификацию
    await ctx.editMessageText(
      '🏢 Отлично! Пара быстрых вопросов чтобы я лучше понял твой бизнес.\n\n*Ваш бизнес оформлен юридически (ИП или ООО)?*',
      { parse_mode: 'Markdown', ...kb.qualLegalKeyboard }
    );
    setStep(telegramId, 'qual_legal');
  }
}

// ─── Сбор данных (текстовые ответы) ──────────────────────
async function handleTextInput(ctx) {
  const telegramId = ctx.from.id;
  const step = getStep(telegramId);
  const text = ctx.message.text.trim();

  if (!step) return;

  if (step === 'ask_name') {
    db.updateUser(telegramId, { name: text });
    setState(telegramId, { name: text });
    await ctx.reply(`Приятно познакомиться, ${text}! 👋\n\nСколько тебе лет?`, kb.ageKeyboard);
    setStep(telegramId, 'ask_age');
    return;
  }

  if (step === 'ask_business_desc') {
    db.updateUser(telegramId, { business_desc: text });
    setState(telegramId, { business_desc: text });
    await ctx.reply('Как часто клиенты покупают у вас?', kb.purchaseFreqKeyboard);
    setStep(telegramId, 'ask_purchase_freq');
    return;
  }

  if (step === 'ask_style_examples') {
    db.updateUser(telegramId, { style: `Примеры: ${text}` });
    setState(telegramId, { style: `Примеры: ${text}` });
    await ctx.reply('Понял стиль! Теперь выбери соцсеть для постов:', kb.socialKeyboard);
    setStep(telegramId, 'ask_social');
    return;
  }

  // Ввод другой соцсети
  if (step === 'ask_social_other') {
    db.updateUser(telegramId, { social_network: text });
    setState(telegramId, { social_network: text });
    await ctx.reply(
      `✅ Отлично, буду готовить посты для "${text}"!\n\nТеперь выбери стиль:`,
      kb.styleKeyboard
    );
    setStep(telegramId, 'ask_style');
    return;
  }

  // Главный вопрос — о чём пост
  if (step === 'ask_post_idea') {
    db.updateUser(telegramId, { keywords: text });
    setState(telegramId, { keywords: text, post_idea: text });
    await ctx.reply(
      '🔥 Отлично! Теперь пришли ссылку на свою страницу в соцсети — посмотрю как ты уже пишешь (необязательно):',
      kb.skipKeyboard
    );
    setStep(telegramId, 'ask_profile');
    return;
  }

  if (step === 'ask_keywords') {
    db.updateUser(telegramId, { keywords: text });
    setState(telegramId, { keywords: text });
    await ctx.reply(
      '🔥 Отлично! Теперь пришли ссылку на свою страницу в соцсети (необязательно):',
      kb.skipKeyboard
    );
    setStep(telegramId, 'ask_profile');
    return;
  }

  if (step === 'ask_profile') {
    const urlRegex = /^https?:\/\/.+/i;
    if (urlRegex.test(text)) {
      db.updateUser(telegramId, { profile_url: text });
      await ctx.reply('✅ Ссылка сохранена!');
      await startGeneration(ctx);
    } else {
      await ctx.reply('Кажется, это не ссылка. Попробуй ещё раз или нажми «Пропустить»:', kb.skipKeyboard);
    }
    return;
  }

  if (step === 'ask_feedback_custom') {
    const state = getState(telegramId);
    await ctx.reply('⚡️ Перегенерирую с учётом твоих пожеланий...');
    try {
      const user = db.getUser(telegramId);
      const userData = buildUserData(user, state);
      const newPost = await regeneratePost(state.current_post_type, userData, text);
      const genId = db.saveGeneration(telegramId, state.current_post_type, userData.topic, userData.social_network, newPost);
      setState(telegramId, { current_gen_id: genId, regen_count: (state.regen_count || 0) + 1 });
      await ctx.reply(
        `📝 *${state.current_post_type.toUpperCase()}*\n\n${newPost}`,
        { parse_mode: 'Markdown', ...kb.ratingKeyboard(genId) }
      );
    } catch (e) {
      await ctx.reply('Произошла ошибка при генерации. Попробуй ещё раз /start');
    }
    return;
  }

  if (step === 'ask_contact') {
    await ctx.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `📞 Запрос на связь от @${ctx.from.username} (${telegramId}):\n${text}`
    );
    await ctx.reply('✅ Отлично! Эксперт свяжется с тобой в ближайшее время.');
    setStep(telegramId, null);
    return;
  }

  if (step === 'ask_user_question') {
    await ctx.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `💬 Вопрос от @${ctx.from.username} (${telegramId}):\n${text}`
    );
    await ctx.reply('✅ Вопрос отправлен! Ответим в ближайшее время.');
    setStep(telegramId, null);
    return;
  }
}

// ─── Callback кнопки ──────────────────────────────────────
async function handleCallback(ctx) {
  const telegramId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const state = getState(telegramId);

  await ctx.answerCbQuery();

  // Разделитель (нажатие не делает ничего)
  if (data === 'noop') return;

  // Тип
  if (data === 'type_personal') return handleTypeChoice(ctx, 'personal');
  if (data === 'type_business') return handleTypeChoice(ctx, 'business');

  // ─── Квалификация бизнеса ────────────────────────────────
  if (data === 'qual_legal_yes') {
    setState(telegramId, { qual_legal: 'yes' });
    await ctx.editMessageText(
      '✅ Отлично!\n\n*Клиенты покупают у вас повторно или платят по подписке?*',
      { parse_mode: 'Markdown', ...kb.qualRepeatKeyboard }
    );
    setStep(telegramId, 'qual_repeat');
    return;
  }

  if (data === 'qual_legal_no') {
    // Нет юрлица — мягко переводим в личный бренд
    db.updateUser(telegramId, { user_type: 'personal' });
    setState(telegramId, { user_type: 'personal', qual_redirected: true });
    await ctx.editMessageText(
      '⏳ Понял! Пока бизнес оформляется — самое время прокачать личный бренд.\n\nПосты о твоей экспертизе привлекут первых клиентов ещё до официального запуска 💡\n\nКак тебя зовут?'
    );
    setStep(telegramId, 'ask_name');
    return;
  }

  if (data === 'qual_repeat_yes' || data === 'qual_repeat_mid' || data === 'qual_repeat_no') {
    setState(telegramId, { qual_repeat: data });
    await ctx.editMessageText(
      '📊 *Примерный оборот вашего бизнеса в месяц?*',
      { parse_mode: 'Markdown', ...kb.qualRevenueKeyboard }
    );
    setStep(telegramId, 'qual_revenue');
    return;
  }

  if (data.startsWith('qual_rev_')) {
    const repeat = state.qual_repeat || '';
    const legal = state.qual_legal || '';
    const isStrong = data !== 'qual_rev_low' && repeat === 'qual_repeat_yes' && legal === 'yes';
    const isMid = data === 'qual_rev_mid' || repeat === 'qual_repeat_mid';

    if (isStrong || isMid) {
      // Сильный бизнес — полная бизнес-ветка
      setState(telegramId, { qual_revenue: data, user_type: 'business' });
      await ctx.editMessageText(
        '🚀 Отлично! У вас зрелый бизнес с потенциалом для партнёрской сети.\n\nЯ помогу создать посты которые привлекут сильных партнёров — владельцев своих каналов продаж.\n\nКак вас зовут?'
      );
    } else {
      // Слабые показатели — переводим в личный бренд
      db.updateUser(telegramId, { user_type: 'personal' });
      setState(telegramId, { qual_revenue: data, user_type: 'personal', qual_redirected: true });
      await ctx.editMessageText(
        '💡 Понял! Сейчас самое важное — нарастить базу клиентов и укрепить позиции.\n\nДавай начнём с личного бренда — посты о твоей экспертизе помогут привлечь первых лояльных покупателей 🎯\n\nКак тебя зовут?'
      );
    }
    setStep(telegramId, 'ask_name');
    return;
  }

  // Возраст
  if (data.startsWith('age_')) {
    const ageMap = {
      age_under18: 'до 18', age_18_25: '18–25', age_26_35: '26–35',
      age_36_45: '36–45', age_46_60: '46–60', age_60plus: '60+'
    };
    db.updateUser(telegramId, { age: ageMap[data] });
    setState(telegramId, { age: ageMap[data] });
    await ctx.editMessageText('Укажи пол:', kb.genderKeyboard);
    setStep(telegramId, 'ask_gender');
    return;
  }

  // Пол
  if (data.startsWith('gender_')) {
    const gender = data === 'gender_male' ? 'Мужской' : 'Женский';
    db.updateUser(telegramId, { gender });
    setState(telegramId, { gender });

    if (state.user_type === 'personal') {
      await ctx.editMessageText(
        'Выбери темы, которые тебе близки (можно несколько):',
        kb.buildInterestsKeyboard([])
      );
      setState(telegramId, { selected_interests: [] });
      setStep(telegramId, 'ask_interests');
    } else {
      await ctx.editMessageText('Расскажи о своём бизнесе: что продаёшь, кто клиенты, как часто покупают?\n\n(напиши в свободной форме)');
      setStep(telegramId, 'ask_business_desc');
    }
    return;
  }

  // Интересы (мультивыбор)
  if (data.startsWith('int_')) {
    const selected = state.selected_interests || [];
    const idx = selected.indexOf(data);
    if (idx === -1) selected.push(data);
    else selected.splice(idx, 1);
    setState(telegramId, { selected_interests: selected });
    await ctx.editMessageReplyMarkup(kb.buildInterestsKeyboard(selected).reply_markup);
    return;
  }

  if (data === 'interests_done') {
    const selected = state.selected_interests || [];
    const interestLabels = selected.map(cb => {
      const item = kb.interestsList.find(i => i.cb === cb);
      return item ? item.text : cb;
    }).join(', ');
    db.updateUser(telegramId, { interests: interestLabels });
    setState(telegramId, { interests: interestLabels });
    await ctx.editMessageText('Выбери тему для постов:', kb.topicsKeyboard);
    setStep(telegramId, 'ask_topic');
    return;
  }

  // Тема
  if (data.startsWith('topic_')) {
    const topicLabel = TOPIC_LABELS[data];
    const usedTopics = db.getUsedTopics(telegramId);
    const user = db.getUser(telegramId);

    if (usedTopics.includes(topicLabel) && user.status !== 'subscribed') {
      await ctx.editMessageText(
        `Тема «${topicLabel}» уже использована в бесплатной версии.\n\nЧтобы получить доступ ко всем темам без ограничений — оформи подписку 💎`,
        kb.finalKeyboard
      );
      return;
    }

    db.addUsedTopic(telegramId, topicLabel);
    setState(telegramId, { topic: topicLabel });
    await ctx.editMessageText('Для какой соцсети готовим посты?', kb.socialKeyboard);
    setStep(telegramId, 'ask_social');
    return;
  }

  // Частота покупок (бизнес)
  if (data.startsWith('pf_')) {
    const pfMap = {
      pf_once: 'Один раз', pf_yearly: 'Несколько раз в год',
      pf_monthly: 'Ежемесячная подписка', pf_other: 'Другое'
    };
    db.updateUser(telegramId, { purchase_freq: pfMap[data] });
    await ctx.editMessageText('Планируете привлекать партнёров (агентов) для продаж?', kb.partnersKeyboard);
    setStep(telegramId, 'ask_partners');
    return;
  }

  // Партнёры
  if (data.startsWith('partners_')) {
    const val = data === 'partners_yes' ? 'yes' : 'no';
    db.updateUser(telegramId, { wants_partners: val });
    await ctx.editMessageText('Для какой соцсети готовим посты?', kb.socialKeyboard);
    setStep(telegramId, 'ask_social');
    return;
  }

  // Соцсеть
  if (data.startsWith('sn_')) {
    const snMap = { sn_vk: 'ВКонтакте', sn_tg: 'Telegram', sn_ig: 'Instagram' };

    if (data === 'sn_other') {
      // Просим ввести название соцсети текстом
      await ctx.editMessageText('Напиши название своей соцсети или платформы (например: YouTube, TikTok, LinkedIn):');
      setStep(telegramId, 'ask_social_other');
      return;
    }

    const sn = snMap[data];
    db.updateUser(telegramId, { social_network: sn });
    setState(telegramId, { social_network: sn });

    await ctx.editMessageText(
      'Выбери стиль постов:',
      kb.styleKeyboard
    );
    setStep(telegramId, 'ask_style');
    return;
  }

  // Стиль
  if (data.startsWith('style_')) {
    const styleMap = {
      style_friendly: 'Дружелюбный', style_expert: 'Экспертный',
      style_bold: 'Дерзкий', style_inspire: 'Вдохновляющий'
    };
    const style = styleMap[data];
    db.updateUser(telegramId, { style });
    setState(telegramId, { style });
    await ctx.editMessageText(
      '✍️ Последний шаг!\n\nРасскажи коротко — *о чём ты хочешь написать?*\n\nНапример: "хочу рассказать как я бросил офис и открыл своё дело" или "хочу привлечь партнёров в свой бизнес по доставке"\n\nЧем конкретнее — тем точнее получится пост 🎯',
      { parse_mode: 'Markdown', ...kb.skipKeyboard }
    );
    setStep(telegramId, 'ask_post_idea');
    return;
  }

  // Пропустить
  if (data === 'skip') {
    const step = getStep(telegramId);
    if (step === 'ask_style' || step === 'ask_style_examples') {
      setState(telegramId, { style: 'Дружелюбный' });
      await ctx.editMessageText(
        '✍️ Расскажи коротко — *о чём ты хочешь написать?*\n\nНапример: "хочу рассказать как похудел на 10 кг" или "ищу партнёров для бизнеса"\n\nЧем конкретнее — тем точнее получится пост 🎯',
        { parse_mode: 'Markdown', ...kb.skipKeyboard }
      );
      setStep(telegramId, 'ask_post_idea');
    } else if (step === 'ask_post_idea') {
      await ctx.editMessageText(
        'Хорошо, буду генерировать на основе выбранной темы!\n\nПришли ссылку на свою страницу в соцсети (необязательно):',
        kb.skipKeyboard
      );
      setStep(telegramId, 'ask_profile');
    } else if (step === 'ask_profile') {
      await startGeneration(ctx);
    }
    return;
  }

  // Продолжить (после проверки профиля)
  if (data === 'continue') {
    await startGeneration(ctx);
    return;
  }

  // Оценка поста
  if (data.startsWith('rate_')) {
    const parts = data.split('_');
    const rating = parseInt(parts[1]);
    const genId = parseInt(parts[2]);

    db.updateRating(genId, rating);

    if (rating >= 4) {
      await ctx.editMessageReplyMarkup(kb.nextPostKeyboard(genId).reply_markup);
      await ctx.reply(`🎉 Отлично! Оценка ${rating}/5. Пост готов к публикации!`);
    } else {
      await ctx.reply(
        'Понял, доработаем! Что не понравилось?',
        kb.feedbackKeyboard()
      );
      setState(telegramId, { current_gen_id: genId, awaiting_feedback: true });
    }
    return;
  }

  // Обратная связь по посту
  if (data.startsWith('fb_')) {
    const fbMap = {
      fb_long: 'Слишком длинно, нужно короче',
      fb_style: 'Не в моём стиле, нужно другой тон',
      fb_facts: 'Не хватает фактов и конкретики',
      fb_ads: 'Слишком рекламно, нужно мягче'
    };

    if (data === 'fb_custom') {
      await ctx.editMessageText('Напиши, что именно изменить:');
      setStep(telegramId, 'ask_feedback_custom');
      return;
    }

    const feedback = fbMap[data];
    await ctx.editMessageText('⚡️ Перегенерирую с учётом пожеланий...');
    try {
      const user = db.getUser(telegramId);
      const userData = buildUserData(user, state);
      const newPost = await regeneratePost(state.current_post_type, userData, feedback);
      const genId = db.saveGeneration(telegramId, state.current_post_type, userData.topic, userData.social_network, newPost);
      setState(telegramId, { current_gen_id: genId, regen_count: (state.regen_count || 0) + 1 });
      await ctx.reply(
        `📝 *${state.current_post_type.toUpperCase()}* (новый вариант)\n\n${newPost}`,
        { parse_mode: 'Markdown', ...kb.ratingKeyboard(genId) }
      );
    } catch (e) {
      await ctx.reply('Ошибка генерации. Попробуй /start');
    }
    return;
  }

  // Следующий пост
  if (data.startsWith('next_')) {
    const currentIdx = state.current_post_index || 0;
    const nextIdx = currentIdx + 1;

    if (nextIdx >= POST_TYPES.length) {
      await showFinalScreen(ctx);
      return;
    }

    setState(telegramId, { current_post_index: nextIdx, regen_count: 0 });
    await generateNextPost(ctx, nextIdx);
    return;
  }

  // Опубликовал
  if (data.startsWith('published_')) {
    const genId = parseInt(data.split('_')[1]);
    db.markPublished(genId);
    await ctx.answerCbQuery('🎉 Записали! Молодец!');
    await ctx.reply('📣 Записали, что ты опубликовал пост! Это помогает нам делать их лучше.');
    return;
  }

  // Финальные кнопки
  if (data === 'subscribe') {
    await ctx.editMessageText(
      '💎 *Подписка 490 руб/мес*\n\nВключает:\n• Неограниченные генерации\n• Все темы\n• Приоритетная поддержка\n• A/B тестирование заголовков\n\n💳 Для оплаты напиши /pay или свяжись с @' + (process.env.ADMIN_USERNAME || 'admin'),
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (data === 'contact_expert') {
    await ctx.editMessageText('📞 Напиши свой контакт (телефон или @username в Telegram), и эксперт свяжется с тобой:');
    setStep(telegramId, 'ask_contact');
    return;
  }

  if (data === 'ask_question') {
    await ctx.editMessageText('💬 Напиши свой вопрос:');
    setStep(telegramId, 'ask_user_question');
    return;
  }
}

// ─── Запуск генерации ─────────────────────────────────────
async function startGeneration(ctx) {
  const telegramId = ctx.from.id;
  setState(telegramId, { current_post_index: 0, regen_count: 0 });

  await ctx.reply('⚡️ Генерирую 4 поста специально для тебя...\n(обычно не больше 3 секунд на каждый)');

  setTimeout(async () => {
    await generateNextPost(ctx, 0);
  }, 500);
}

async function generateNextPost(ctx, index) {
  const telegramId = ctx.from.id;
  const postType = POST_TYPES[index];
  const user = db.getUser(telegramId);
  const state = getState(telegramId);

  setState(telegramId, { current_post_type: postType, current_post_index: index });

  const loadingMsg = await ctx.reply(`🔄 Создаю *${postType}* пост...`, { parse_mode: 'Markdown' });

  try {
    const userData = buildUserData(user, state);
    const post = await generatePost(postType, userData);
    const genId = db.saveGeneration(telegramId, postType, userData.topic, userData.social_network, post);
    setState(telegramId, { current_gen_id: genId });

    await ctx.telegram.deleteMessage(telegramId, loadingMsg.message_id).catch(() => {});

    await ctx.reply(
      `📝 *Пост ${index + 1} из 4 — ${postType.toUpperCase()}*\n\n${post}\n\n⭐️ Оцени пост:`,
      { parse_mode: 'Markdown', ...kb.ratingKeyboard(genId) }
    );
  } catch (e) {
    console.error('Ошибка генерации:', e.message);
    await ctx.telegram.deleteMessage(telegramId, loadingMsg.message_id).catch(() => {});
    await ctx.reply('❌ Ошибка при обращении к AI. Проверь ключи API или попробуй позже.\n/start — начать заново');
  }
}

async function showFinalScreen(ctx) {
  const telegramId = ctx.from.id;
  const user = db.getUser(telegramId);
  const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.referral_code}`;

  await ctx.reply(
    `🔥 Все 4 поста готовы!\n\nКак вам такие посты? Хотите получать их регулярно?`,
    kb.finalKeyboard
  );

  await ctx.reply(
    `🎁 *Реферальная программа*\n\nПриглашай друзей и получай *10%* от их первой оплаты на свой баланс!\n\nТвоя ссылка:\n\`${refLink}\``,
    { parse_mode: 'Markdown' }
  );
}

// ─── Вспомогательные ─────────────────────────────────────
function buildUserData(user, state) {
  return {
    name: user.name,
    age: user.age,
    gender: user.gender,
    user_type: user.user_type,
    interests: user.interests,
    business_desc: user.business_desc,
    social_network: user.social_network || state.social_network || 'Telegram',
    style: user.style || state.style || 'Дружелюбный',
    keywords: user.keywords,
    topic: state.topic || 'развитие и успех',
    purchase_freq: user.purchase_freq,
    wants_partners: user.wants_partners
  };
}

// ─── Команды ──────────────────────────────────────────────
async function handleBalance(ctx) {
  const user = db.getUser(ctx.from.id);
  if (!user) return ctx.reply('Сначала напиши /start');
  await ctx.reply(`💰 Твой баланс: *${user.balance} руб.*\n\nПополнить: /topup\nВывести: /withdraw`, { parse_mode: 'Markdown' });
}

async function handleWithdraw(ctx) {
  await ctx.reply('💸 Для вывода средств напиши администратору: @' + (process.env.ADMIN_USERNAME || 'admin') + '\n\nУкажи свой Telegram ID: `' + ctx.from.id + '`', { parse_mode: 'Markdown' });
}

async function handleAdmin(ctx) {
  if (String(ctx.from.id) !== String(process.env.ADMIN_CHAT_ID)) {
    return ctx.reply('Нет доступа');
  }
  const stats = db.getStats();
  const topTopics = stats.topTopics.map(t => `• ${t.topic}: ${t.cnt}`).join('\n');
  await ctx.reply(
    `📊 *Статистика бота*\n\n👥 Пользователей: ${stats.totalUsers}\n📝 Генераций: ${stats.totalGenerations}\n📣 Опубликовано: ${stats.published}\n\n🏆 Топ тем:\n${topTopics}`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = {
  handleStart, handleTypeChoice, handleTextInput,
  handleCallback, handleBalance, handleWithdraw, handleAdmin
};
