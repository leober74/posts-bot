const { getState, setState, clearState, setStep, getStep } = require('../services/state');
const db = require('../models/db');
const { generatePost, regeneratePost } = require('../services/gigachat');
const kb = require('../utils/keyboards');

const POST_TYPES = ['продающий', 'развлекательный', 'экспертный', 'вовлекающий'];

// ─── Форматирование поста — первая строка жирная ──────────
function formatPost(post) {
  if (!post) return post;
  const lines = post.split('\n');
  const firstLine = lines[0]
    .replace(/\*/g, '')
    .replace(/^["«„"']|["»"']$/g, '') // убираем кавычки в начале и конце
    .replace(/[_]/g, ' ')
    .trim();
  const rest = lines.slice(1).join('\n');
  return `*${firstLine}*\n${rest}`;
}

// ─── Определение пола по имени ────────────────────────────
function detectGender(name) {
  if (!name) return 'Не указан';
  const n = name.trim().toLowerCase().split(' ')[0]; // берём только первое слово

  const male = ['александр','алексей','андрей','антон','артём','артем','борис','вадим','валентин',
    'василий','виктор','виталий','владимир','владислав','вячеслав','геннадий','георгий','григорий',
    'даниил','daniel','денис','дмитрий','евгений','иван','игорь','илья','кирилл','константин',
    'леонид','максим','михаил','никита','николай','олег','павел','пётр','петр','роман','руслан',
    'сергей','степан','тимур','фёдор','федор','филипп','юрий','яков','ярослав','глеб','лев',
    'марк','матвей','мирон','платон','савелий','тихон','арсений','всеволод','святослав'];

  const female = ['александра','алина','алиса','алла','анастасия','анна','валентина','валерия',
    'вера','виктория','галина','дарья','диана','екатерина','елена','елизавета','жанна','ирина',
    'карина','кристина','ксения','лариса','лидия','людмила','маргарита','марина','мария','надежда',
    'наталья','наталия','нина','оксана','ольга','полина','светлана','софья','софия','тамара',
    'татьяна','ульяна','юлия','яна','вероника','евгения','жанна','зинаида','зоя','инна','лилия',
    'милана','мила','регина','рита','снежана','эвелина','эллина',
    // Короткие и уменьшительные женские
    'свет','люда','катя','маша','таня','наташа','оля','лена','женя','соня','поля','вика',
    'даша','саша','настя','ксюша','лиза','аня','нина','рита','жанна','алла','нора',
    'белла','элла','анжела','анжелика','кира','лира','мира','зара','лара','клара'];

  if (male.includes(n)) return 'Мужской';
  if (female.includes(n)) return 'Женский';

  // По окончанию имени если не нашли в списке
  if (n.endsWith('а') || n.endsWith('я') || n.endsWith('ия')) return 'Женский';
  return 'Мужской'; // по умолчанию
}

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

  // Обработка реферальной ссылки и сегмента
  const startPayload = ctx.message?.text?.split(' ')[1];
  let segment = 'general';

  if (startPayload) {
    if (startPayload.includes('_noshop')) {
      segment = 'noshop'; // Партнёры Shop не из структуры
    } else if (startPayload.includes('_deepinvol')) {
      segment = 'business'; // Прямо на бизнес-ветку
    }

    if (startPayload.startsWith('ref_')) {
      const referrer = db.getUserByRefCode(startPayload);
      if (referrer && String(referrer.telegram_id) !== String(telegramId)) {
        setState(telegramId, { referred_by: startPayload });
      }
    }
  }

  db.createUser(telegramId, username);
  db.updateUser(telegramId, { segment, user_type: '' });

  // Сбрасываем состояние — начинаем чистый диалог
  clearState(telegramId);
  setState(telegramId, { segment });

  // Если сегмент noshop — сначала спрашиваем фильтрующий вопрос
  if (segment === 'noshop') {
    await ctx.reply(
      `Привет! 👋 Я помогу тебе создавать посты которые реально читают и на которые откликаются.\n\nПара секунд — скажи, ты уже работаешь с какой-то партнёрской программой или сетевым бизнесом?`,
      kb.partnerFilterKeyboard
    );
    setStep(telegramId, 'ask_partner_filter');
    return;
  }

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
    // Бизнес — сразу в калькулятор потерь
    await ctx.editMessageText(
      '🏢 Отлично!\n\nПрежде чем генерировать посты — давай посчитаем сколько ты сейчас теряешь на ручном управлении партнёрской сетью.\n\n*Займёт 3 минуты. В конце покажу конкретную цифру.*\n\n1️⃣ Сколько партнёров сейчас в твоей сети?\n_(напиши число, например: 47)_',
      { parse_mode: 'Markdown' }
    );
    setStep(telegramId, 'calc_partners_count');
  }
}

// ─── Сбор данных (текстовые ответы) ──────────────────────
async function handleTextInput(ctx) {
  const telegramId = ctx.from.id;
  const step = getStep(telegramId);
  const text = ctx.message.text.trim();

  if (!step) return;

  if (step === 'ask_name') {
    const gender = detectGender(text);
    db.updateUser(telegramId, { name: text, gender });
    setState(telegramId, { name: text, gender });
    await ctx.reply(`Приятно познакомиться, ${text}! 👋\n\nСколько тебе лет?`, kb.ageKeyboard);
    setStep(telegramId, 'ask_age');
    return;
  }

  if (step === 'ask_business_desc') {
    db.updateUser(telegramId, { business_desc: text });
    setState(telegramId, { business_desc: text });
    await ctx.reply('Как часто клиенты покупают у тебя?', kb.purchaseFreqKeyboard);
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
    const lower = text.toLowerCase();

    // YouTube и TikTok — не текстовые платформы
    if (lower.includes('youtube') || lower.includes('ютуб') || lower.includes('tiktok') || lower.includes('тикток')) {
      await ctx.reply(
        `На ${text} публикуют видео, а не текстовые посты 🎬\n\nЯ специализируюсь на текстовых постах. Выбери соцсеть где будешь их публиковать — например Telegram, ВКонтакте или Instagram:`,
        kb.socialKeyboard
      );
      return;
    }

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
    // Проверяем что ответ осмысленный — минимум 3 слова или 10 символов
    const words = text.split(/\s+/).filter(w => w.length > 1);
    const isMeaningless = text.length < 10 || words.length < 2;

    if (isMeaningless) {
      await ctx.reply(
        `Напиши чуть подробнее 😊\n\nНапример: _"хочу рассказать как начал своё дело"_ или _"ищу партнёров для бизнеса по доставке"_\n\nЧем конкретнее — тем точнее получится пост 🎯`,
        { parse_mode: 'Markdown', ...kb.skipKeyboard }
      );
      return;
    }

    db.updateUser(telegramId, { keywords: text });
    setState(telegramId, { keywords: text, post_idea: text });
    await ctx.reply(
      '👍 Отлично! Теперь пришли ссылку на свою страницу в соцсети — посмотрю как ты уже пишешь (необязательно):',
      kb.skipKeyboard
    );
    setStep(telegramId, 'ask_profile');
    return;
  }

  if (step === 'ask_keywords') {
    db.updateUser(telegramId, { keywords: text });
    setState(telegramId, { keywords: text });
    await ctx.reply(
      '👍 Принял! Теперь пришли ссылку на свою страницу в соцсети (необязательно):',
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

  if (step === 'ask_deepinvol_contact') {
    const user = db.getUser(telegramId);
    db.saveDeepinvolLead(telegramId, ctx.from.username, user?.name, user?.business_desc, text);
    await ctx.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `🏢 НОВЫЙ ЛИД DEEPINVOL!\n\nИмя: ${user?.name || 'не указано'}\nUsername: @${ctx.from.username || 'нет'}\nBusiness: ${user?.business_desc || 'нет'}\nКонтакт: ${text}`
    );
    await ctx.reply('✅ Отлично! Мы свяжемся с тобой в ближайшее время.\n\nПока можешь продолжать использовать бота — генерируй посты для привлечения первых партнёров в свой бизнес 🚀');
    setStep(telegramId, null);
    return;
  }

  // ─── Калькулятор потерь (бизнес-ветка) ───────────────────
  if (step === 'calc_partners_count') {
    const num = parseInt(text);
    if (isNaN(num) || num < 1) {
      await ctx.reply('Напиши число — сколько партнёров в сети? (например: 47)');
      return;
    }
    setState(telegramId, { calc_partners: num });
    await ctx.reply(
      `2️⃣ Сколько *уровней вознаграждения* в твоей системе?\n\n_(например: 3 уровня, 5 уровней — напиши цифру)_`,
      { parse_mode: 'Markdown' }
    );
    setStep(telegramId, 'calc_levels');
    return;
  }

  if (step === 'calc_levels') {
    const num = parseInt(text);
    if (isNaN(num) || num < 1) {
      await ctx.reply('Напиши число уровней (например: 3)');
      return;
    }
    setState(telegramId, { calc_levels: num });
    await ctx.reply(
      `3️⃣ Сколько *часов в месяц* уходит на расчёт выплат партнёрам?\n\n_(считай всё: Excel, проверки, звонки с вопросами "почему мне столько начислили?" — напиши число часов)_`,
      { parse_mode: 'Markdown' }
    );
    setStep(telegramId, 'calc_hours');
    return;
  }

  if (step === 'calc_hours') {
    const num = parseFloat(text);
    if (isNaN(num) || num < 0) {
      await ctx.reply('Напиши число часов (например: 12)');
      return;
    }
    setState(telegramId, { calc_hours: num });
    await ctx.reply(
      `4️⃣ Были ли *ошибки в выплатах* за последние 3 месяца?\n\n_(партнёр получил не ту сумму, недоплата, переплата, конфликт из-за расчётов)_`,
      kb.calcErrorsKeyboard
    );
    setStep(telegramId, 'calc_errors');
    return;
  }

  if (step === 'calc_hourly_rate') {
    const rate = parseInt(text) || 1500;
    setState(telegramId, { calc_rate: rate });
    await showCalculatorResult(ctx);
    return;
  }

  // ─── Старое интервью (текстовые ответы) ───────────────────
  if (step === 'ask_business_interview') {
    setState(telegramId, { interview_desc: text });
    await ctx.reply(
      '2️⃣ *Какую главную проблему хочешь решить с помощью партнёрской сети?*',
      { parse_mode: 'Markdown' }
    );
    setStep(telegramId, 'interview_problem');
    return;
  }

  if (step === 'interview_problem') {
    setState(telegramId, { interview_problem: text });
    await ctx.reply(
      '3️⃣ *Пробовал ли ты уже привлекать партнёров или агентов для продаж?*\n\nЕсли да — что получилось? Если нет — почему не пробовали?',
      { parse_mode: 'Markdown' }
    );
    setStep(telegramId, 'interview_tried');
    return;
  }

  if (step === 'interview_tried') {
    setState(telegramId, { interview_tried: text });
    await ctx.reply(
      '4️⃣ *Вопрос про цену платформы:*\n\nПри каком ценнике в месяц ты бы *точно купил* доступ к платформе для управления партнёрской сетью?\n\n_(выбери один вариант)_',
      { parse_mode: 'Markdown', ...kb.wtpYesKeyboard }
    );
    setStep(telegramId, 'interview_wtp_yes');
    return;
  }

  if (step === 'interview_nps_comment') {
    const istate = getState(telegramId);
    // Сохраняем всё интервью
    db.saveInterview(telegramId, {
      name: istate.name,
      business_desc: istate.business_desc || istate.interview_desc,
      main_problem: istate.interview_problem,
      tried_before: istate.interview_tried,
      wtp_yes: istate.wtp_yes,
      wtp_maybe: istate.wtp_maybe,
      wtp_no: istate.wtp_no,
      nps_score: istate.interview_nps
    });
    db.saveNPS(telegramId, 'business', istate.interview_nps, text);

    // Уведомляем админа
    await ctx.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `📋 НОВОЕ ИНТЕРВЬЮ!\n\n` +
      `👤 @${ctx.from.username || telegramId}\n` +
      `🏢 Бизнес: ${istate.interview_desc || istate.business_desc || '?'}\n` +
      `❓ Проблема: ${istate.interview_problem || '?'}\n` +
      `🔄 Пробовал: ${istate.interview_tried || '?'}\n` +
      `💰 WTP точно: ${istate.wtp_yes || '?'}\n` +
      `💰 WTP может: ${istate.wtp_maybe || '?'}\n` +
      `💰 WTP нет: ${istate.wtp_no || '?'}\n` +
      `⭐️ NPS: ${istate.interview_nps}/10\n` +
      `💬 Комментарий: ${text}`
    ).catch(() => {});

    await ctx.reply('🙏 Спасибо за честные ответы! Это очень помогает.\n\nТеперь перейдём к квалификации и генерации постов 🚀');

    // Переходим к квалификации
    await ctx.reply(
      '✅ *Твой бизнес оформлен юридически (ИП или ООО)?*',
      { parse_mode: 'Markdown', ...kb.qualLegalKeyboard }
    );
    setStep(telegramId, 'qual_legal');
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

  // ─── Фильтр партнёров Shop ────────────────────────────────
  if (data === 'pf_has_partner') {
    // Уже в партнёрской программе — скрываем Shop, ведём к другим темам
    db.updateUser(telegramId, { segment: 'noshop' });
    setState(telegramId, { segment: 'noshop' });
    await ctx.editMessageText(
      '👍 Понял! Тогда сосредоточимся на темах которые помогут тебе развивать другие направления и привлекать новую аудиторию.\n\nКак тебя зовут?'
    );
    setStep(telegramId, 'ask_name');
    return;
  }

  if (data === 'pf_no_partner') {
    // Не в партнёрской программе — показываем всё
    db.updateUser(telegramId, { segment: 'general' });
    setState(telegramId, { segment: 'general' });
    await ctx.editMessageText(
      `Отлично! Давай сделаем посты которые реально работают.\n\nКак тебя зовут?`
    );
    setStep(telegramId, 'ask_name');
    return;
  }

  if (data === 'pf_has_business') {
    // Есть свой бизнес — направляем в бизнес-ветку
    db.updateUser(telegramId, { segment: 'business', user_type: 'business' });
    setState(telegramId, { segment: 'business', user_type: 'business' });
    await ctx.editMessageText(
      '🏢 Отлично! Пара быстрых вопросов чтобы я лучше понял твой бизнес.\n\n*Бизнес оформлен юридически (ИП или ООО)?*',
      { parse_mode: 'Markdown', ...kb.qualLegalKeyboard }
    );
    setStep(telegramId, 'qual_legal');
    return;
  }

  // ─── Калькулятор потерь — колбэки ────────────────────────
  if (data.startsWith('calc_errors_')) {
    const hasErrors = data === 'calc_errors_yes';
    setState(telegramId, { calc_errors: hasErrors });
    await ctx.editMessageText(
      `5️⃣ Последний вопрос.\n\nСколько стоит твой рабочий час?\n_(это нужно для точного расчёта — напиши сумму в рублях, например: 2000)_`
    );
    setStep(telegramId, 'calc_hourly_rate');
    return;
  }

  if (data === 'pilot_yes') {
    await ctx.editMessageText('🚀 Отлично! Напиши свой контакт — имя и телефон или @username в Telegram:');
    setStep(telegramId, 'ask_deepinvol_contact');
    return;
  }

  if (data === 'pilot_later') {
    // Переходим к генерации постов
    await ctx.editMessageText(
      '👍 Понял! Когда будешь готов — просто напиши /start и вернёмся к этому.\n\nА пока давай сделаем посты которые привлекут новых партнёров в твою сеть 💪\n\nКак тебя зовут?'
    );
    setStep(telegramId, 'ask_name');
    return;
  }

  if (data === 'pilot_questions') {
    await ctx.editMessageText(
      '💬 Напиши свой вопрос — отвечу лично:'
    );
    setStep(telegramId, 'ask_user_question');
    return;
  }

  // ─── Интервью ─────────────────────────────────────────────
  if (data === 'interview_start') {
    await ctx.editMessageText(
      '1️⃣ *Расскажи коротко — чем занимается твой бизнес?*\n\nНапиши 2-3 предложения: что продаёшь, кому, как давно работаешь.',
      { parse_mode: 'Markdown' }
    );
    setStep(telegramId, 'interview_problem');
    // Используем interview_problem для описания бизнеса — переопределяем шаг
    setStep(telegramId, 'ask_business_interview');
    return;
  }

  if (data === 'interview_skip') {
    // Пропустили интервью — сразу к квалификации
    await ctx.editMessageText(
      '✅ *Твой бизнес оформлен юридически (ИП или ООО)?*',
      { parse_mode: 'Markdown', ...kb.qualLegalKeyboard }
    );
    setStep(telegramId, 'qual_legal');
    return;
  }

  // WTP — точно купил бы
  if (data.startsWith('wtp_yes_')) {
    const val = data.replace('wtp_yes_', '');
    const labels = { '5k': 'до 5 000 ₽', '15k': '5 000–15 000 ₽', '30k': '15 000–30 000 ₽', '75k': '30 000–75 000 ₽', '75kplus': '75 000+ ₽' };
    setState(telegramId, { wtp_yes: labels[val] });
    await ctx.editMessageText(
      `✅ Записал!\n\nПри каком ценнике ты бы *подумал* — возможно купили бы?`,
      { parse_mode: 'Markdown', ...kb.wtpMaybeKeyboard }
    );
    setStep(telegramId, 'interview_wtp_maybe');
    return;
  }

  // WTP — подумал бы
  if (data.startsWith('wtp_maybe_')) {
    const val = data.replace('wtp_maybe_', '');
    const labels = { '5k': 'до 5 000 ₽', '15k': '5 000–15 000 ₽', '30k': '15 000–30 000 ₽', '75k': '30 000–75 000 ₽', '75kplus': '75 000+ ₽' };
    setState(telegramId, { wtp_maybe: labels[val] });
    await ctx.editMessageText(
      `Понял!\n\nПри каком ценнике ты бы *точно отказался*?`,
      { parse_mode: 'Markdown', ...kb.wtpNoKeyboard }
    );
    setStep(telegramId, 'interview_wtp_no');
    return;
  }

  // WTP — отказал
  if (data.startsWith('wtp_no_')) {
    const val = data.replace('wtp_no_', '');
    const labels = { '5k': 'до 5 000 ₽', '15k': '5 000–15 000 ₽', '30k': '15 000–30 000 ₽', '75k': '30 000–75 000 ₽', '75kplus': '75 000+ ₽' };
    setState(telegramId, { wtp_no: labels[val] });
    await ctx.editMessageText(
      '5️⃣ *Последний вопрос — NPS:*\n\nС какой вероятностью от 0 до 10 ты порекомендуешь нашу платформу коллеге-предпринимателю?\n\n_0 — точно не порекомендую, 10 — точно порекомендую_',
      { parse_mode: 'Markdown', ...kb.npsKeyboard() }
    );
    setStep(telegramId, 'interview_nps');
    return;
  }

  // NPS оценка
  if (data.startsWith('nps_')) {
    const score = parseInt(data.replace('nps_', ''));
    setState(telegramId, { interview_nps: score });
    const step = getStep(telegramId);

    if (step === 'interview_nps') {
      // Интервью — просим комментарий
      await ctx.editMessageText(
        `Оценка ${score}/10 — записал! 🙏\n\nНапиши коротко *почему именно такая оценка*? (можно 1 предложение)`,
        { parse_mode: 'Markdown' }
      );
      setStep(telegramId, 'interview_nps_comment');
    } else {
      // NPS для обычных пользователей
      db.saveNPS(telegramId, 'personal', score, '');
      const msg = score >= 9
        ? '🔥 Спасибо! Ты промоутер — это лучший комплимент!'
        : score >= 7
        ? '😊 Спасибо за оценку!'
        : '🙏 Спасибо за честность — будем работать над улучшением!';
      await ctx.editMessageText(msg);

      // Показываем реферальную ссылку как призыв к действию
      const user = db.getUser(telegramId);
      const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.referral_code}`;
      await ctx.reply(
        `🎁 Кстати — за каждого друга которого пригласишь получишь *10%* от его оплаты!\n\nТвоя ссылка:\n\`${refLink}\``,
        { parse_mode: 'Markdown' }
      );
    }
    return;
  }

  // ─── Deepinvol лид ────────────────────────────────────────
  if (data === 'deepinvol_join') {
    await ctx.editMessageText(
      '🚀 Отлично! Напиши коротко — чем занимается твой бизнес и как с тобой связаться (телефон или Telegram):',
    );
    setStep(telegramId, 'ask_deepinvol_contact');
    return;
  }

  if (data === 'deepinvol_info') {
    await ctx.editMessageText(
      '📋 *Deepinvol* — это платформа для владельцев бизнеса которые хотят выстроить партнёрскую сеть продаж.\n\nВместо найма менеджеров — независимые партнёры продают твой продукт и получают комиссию. Ты платишь только за результат.\n\nМы сейчас набираем первых 20 компаний на особых условиях входа.\n\nХочешь попасть в список?',
      { parse_mode: 'Markdown', ...kb.deepinvolKeyboard }
    );
    return;
  }

  // Тип
  if (data === 'type_personal') return handleTypeChoice(ctx, 'personal');
  if (data === 'type_business') return handleTypeChoice(ctx, 'business');

  // ─── Квалификация бизнеса ────────────────────────────────
  if (data === 'qual_legal_yes') {
    setState(telegramId, { qual_legal: 'yes' });
    await ctx.editMessageText(
      '✅ Отлично!\n\n*Клиенты покупают у тебя повторно или платят по подписке?*',
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
      '📊 *Примерный оборот твоего бизнеса в месяц?*',
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
        '🚀 Отлично! У тебя зрелый бизнес с потенциалом для партнёрской сети.\n\nЯ помогу создать посты которые привлекут сильных партнёров — владельцев своих каналов продаж.\n\nКак тебя зовут?'
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
    const age = ageMap[data];
    db.updateUser(telegramId, { age });
    setState(telegramId, { age });

    if (state.user_type === 'personal' || (!state.user_type && !state.segment?.includes('business'))) {
      await ctx.editMessageText(
        'Выбери тему которая тебе ближе всего — о чём будем писать посты:',
        kb.buildInterestsKeyboard([])
      );
      setState(telegramId, { selected_interests: [] });
      setStep(telegramId, 'ask_interests');
    } else if (state.user_type === 'business') {
      await ctx.editMessageText('Расскажи о своём бизнесе: что продаёшь, кто клиенты, как часто покупают?\n\n(напиши в свободной форме)');
      setStep(telegramId, 'ask_business_desc');
    } else {
      // Страховка — если user_type неизвестен, идём в личный бренд
      await ctx.editMessageText(
        'Выбери тему которая тебе ближе всего — о чём будем писать посты:',
        kb.buildInterestsKeyboard([])
      );
      setState(telegramId, { selected_interests: [] });
      setStep(telegramId, 'ask_interests');
    }
    return;
  }

  // Пол (оставляем на случай если понадобится в будущем, но не показываем)
  if (data.startsWith('gender_')) {
    const gender = data === 'gender_male' ? 'Мужской' : 'Женский';
    db.updateUser(telegramId, { gender });
    setState(telegramId, { gender });
    if (state.user_type === 'personal') {
      await ctx.editMessageText(
        'Что для тебя важно в жизни? (можно выбрать несколько)\n\nЭто поможет боту писать посты на твоём языке:',
        kb.buildInterestsKeyboard([])
      );
      setState(telegramId, { selected_interests: [] });
      setStep(telegramId, 'ask_interests');
    } else {
      await ctx.editMessageText('Расскажи о своём бизнесе:');
      setStep(telegramId, 'ask_business_desc');
    }
    return;
  }

  // Интересы (одиночный выбор — сразу переходим дальше)
  if (data.startsWith('int_')) {
    const item = kb.interestsList.find(i => i.cb === data);
    const interestLabel = item ? item.text : data;

    db.updateUser(telegramId, { interests: interestLabel });
    db.addUsedTopic(telegramId, interestLabel);
    setState(telegramId, { interests: interestLabel, topic: interestLabel, selected_interests: [data] });

    // Замораживаем клавиатуру — показываем выбранное
    await ctx.editMessageReplyMarkup(kb.buildInterestsKeyboard([data], true).reply_markup);

    await ctx.reply('Для какой соцсети готовим посты?', kb.socialKeyboard);
    setStep(telegramId, 'ask_social');
    return;
  }

  if (data === 'interests_done') {
    // Страховка если кто-то нажмёт старую кнопку
    await ctx.answerCbQuery('👆 Выбери тему из списка выше!', { show_alert: true });
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

    // Показываем кнопки с галочкой на выбранной, остальные — noop
    const { Markup } = require('telegraf');
    const frozenKeyboard = Markup.inlineKeyboard(
      Object.entries(TOPIC_LABELS).map(([cb, label]) => [
        Markup.button.callback(
          label === topicLabel ? `✅ ${label}` : label,
          label === topicLabel ? 'noop' : 'noop'
        )
      ])
    );

    await ctx.editMessageText(
      `Тема выбрана!\n\nДля какой соцсети готовим посты?`,
      { ...frozenKeyboard }
    );

    await ctx.reply('Для какой соцсети готовим посты?', kb.socialKeyboard);
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
    await ctx.editMessageText('Планируешь привлекать партнёров (агентов) для продаж?', kb.partnersKeyboard);
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
      await ctx.editMessageText('Напиши название своей соцсети (например: Одноклассники, LinkedIn, Дзен, Threads):');
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
      const user = db.getUser(telegramId) || {};
      const socialNetwork = user.social_network || state.social_network || 'Telegram';
      const currentIdx = state.current_post_index || 0;
      const nextIdx = currentIdx + 1;

      // Убираем кнопки оценки — без восторженных фраз
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

      // Инструкция — только после первого поста
      if (currentIdx === 0) {
        const guides = {
          'ВКонтакте': '📋 *Как опубликовать во ВКонтакте:*\n1. Скопируй текст поста выше (зажми → Копировать)\n2. Открой ВКонтакте → нажми "Что у меня нового?"\n3. Вставь текст\n4. Добавь фото по желанию\n5. Нажми "Опубликовать" ✅',
          'Telegram': '📋 *Как опубликовать в Telegram:*\n1. Скопируй текст поста выше\n2. Открой свой канал или группу\n3. Нажми на поле сообщения → вставь текст\n4. Нажми отправить ✅',
          'Instagram': '📋 *Как опубликовать в Instagram:*\n1. Скопируй текст поста выше\n2. Открой Instagram → нажми + (новая публикация)\n3. Выбери фото или Reels\n4. В поле "Подпись" вставь текст\n5. Нажми "Поделиться" ✅'
        };
        const guide = guides[socialNetwork] || '📋 Скопируй текст поста и вставь в свою соцсеть.';
        await ctx.reply(guide, { parse_mode: 'Markdown' });
      }

      if (nextIdx >= POST_TYPES.length) {
        await showFinalScreen(ctx);
      } else {
        await ctx.reply(
          `✅ Пост ${currentIdx + 1} из 4 готов!\n\nПереходим к следующему?`,
          kb.nextPostKeyboard(genId)
        );
        setState(telegramId, { current_post_index: nextIdx });
      }

    } else {
      // Оценка 1, 2 или 3 — спрашиваем причину
      const messages = {
        1: '😞 Совсем не то? Давай разберёмся и переделаем полностью.\n\n*Что именно не понравилось?*',
        2: '🤔 Понял, есть над чем поработать.\n\n*Что мешает опубликовать этот пост?*',
        3: '✏️ Почти готово, но что-то не так.\n\n*Что подправить?*'
      };
      await ctx.reply(
        messages[rating] || '✏️ Что изменить?',
        { parse_mode: 'Markdown', ...kb.feedbackKeyboard() }
      );
      setState(telegramId, { current_gen_id: genId, awaiting_feedback: true });
    }
    return;
  }

  // Обратная связь по посту
  if (data.startsWith('fb_')) {
    const fbMap = {
      fb_long:     'Слишком длинно — сократи до сути, убери лишнее',
      fb_short:    'Слишком коротко — раскрой тему глубже, добавь деталей',
      fb_style:    'Не мой стиль — перепиши другим тоном, более живым и личным',
      fb_facts:    'Нет конкретики — добавь факты, цифры, реальные примеры',
      fb_ads:      'Слишком рекламно и агрессивно — сделай мягче, больше пользы читателю',
      fb_angle:    'Не та идея — возьми другой угол зрения, другую историю, другой заход',
      fb_boring:   'Скучно и банально — сделай живее, добавь неожиданный поворот или эмоцию',
      fb_title:    'Заголовок слабый — придумай более цепляющий и конкретный',
      fb_audience: 'Не попадает в мою аудиторию — перепиши с фокусом на их реальные боли',
      fb_engage:   'Нет вовлечения — добавь сильный вопрос или интригу чтобы захотелось ответить'
    };

    if (data === 'fb_custom') {
      await ctx.editMessageText('Напиши, что именно изменить:');
      setStep(telegramId, 'ask_feedback_custom');
      return;
    }

    const feedback = fbMap[data] || 'Не понравилось — сделай принципиально другой вариант';
    const regenCount = (state.regen_count || 0) + 1;
    await ctx.editMessageText('⚡️ Перегенерирую с учётом пожеланий...');
    try {
      const user = db.getUser(telegramId);
      const userData = buildUserData(user, state);
      const newPost = await regeneratePost(state.current_post_type, userData, feedback, regenCount);
      const genId = db.saveGeneration(telegramId, state.current_post_type, userData.topic, userData.social_network, newPost);
      setState(telegramId, { current_gen_id: genId, regen_count: regenCount });
      await ctx.reply(
        `📝 *${state.current_post_type.toUpperCase()}* (вариант ${regenCount + 1})\n\n${formatPost(newPost)}\n\n⭐️ Оцени:`,
        { parse_mode: 'Markdown', ...kb.ratingKeyboard(genId) }
      );
    } catch (e) {
      console.error('Ошибка перегенерации:', e.message);
      const { Markup } = require('telegraf');
      await ctx.reply(
        '⚠️ GigaChat не ответил — попробуй ещё раз',
        Markup.inlineKeyboard([[Markup.button.callback('🔄 Попробовать ещё раз', data)]])
      );
    }
    return;
  }

  // Следующий пост
  if (data.startsWith('next_')) {
    const currentIdx = state.current_post_index || 0;

    if (currentIdx >= POST_TYPES.length) {
      await showFinalScreen(ctx);
      return;
    }

    setState(telegramId, { regen_count: 0 });
    await generateNextPost(ctx, currentIdx);
    return;
  }

  // Опубликовал
  if (data.startsWith('published_')) {
    const genId = parseInt(data.split('_')[1]);
    db.markPublished(genId);
    await ctx.answerCbQuery('✅ Записали!');
    return;
  }

  // Финальные кнопки
  if (data === 'subscribe') {
    await ctx.editMessageText(
      '💎 *Подписка 100 руб/мес*\n\n' +
      'Включает:\n' +
      '• Неограниченные генерации по всем темам\n' +
      '• Повторная генерация уже использованных тем\n' +
      '• Картинка к посту (AI-генерация)\n' +
      '• A/B тестирование заголовков\n' +
      '• Аналитика — какие посты получают больше отклика\n' +
      '• Статистика заработка по реферальной программе\n' +
      '• Приоритетная поддержка',
      {
        parse_mode: 'Markdown',
        ...require('telegraf').Markup.inlineKeyboard([
          [require('telegraf').Markup.button.url('💳 Оплатить 100 руб', 'https://checkout.tochka.com/09495d68-9066-4f07-8349-fe75292f7b86')],
          [require('telegraf').Markup.button.url('💬 Задать вопрос', 'https://t.me/leonid.berenshtein')]
        ])
      }
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

// ─── Калькулятор потерь — результат ──────────────────────
async function showCalculatorResult(ctx) {
  const telegramId = ctx.from.id;
  const state = getState(telegramId);

  const partners = state.calc_partners || 0;
  const levels = state.calc_levels || 1;
  const hours = state.calc_hours || 0;
  const rate = state.calc_rate || 1500;
  const hasErrors = state.calc_errors || false;

  // Расчёт потерь
  const monthlyCost = Math.round(hours * rate);
  const yearlyCost = monthlyCost * 12;
  const errorCost = hasErrors ? Math.round(partners * 500) : 0; // ~500 руб риск на партнёра при ошибках
  const totalMonthly = monthlyCost + errorCost;

  // Мини-демо расчёта
  const demoLevel1 = 10; // % первого уровня для демо
  const demoSale = 10000; // средняя сделка
  const demoBonus = Math.round(demoSale * demoLevel1 / 100);

  setState(telegramId, {
    calc_monthly_cost: totalMonthly,
    calc_yearly_cost: yearlyCost,
    interview_desc: `Партнёров: ${partners}, уровней: ${levels}`
  });

  // Сохраняем в интервью
  db.saveInterview(telegramId, {
    business_desc: `Партнёров: ${partners}, уровней: ${levels}`,
    main_problem: `Часов на расчёты: ${hours}/мес, ошибки: ${hasErrors ? 'да' : 'нет'}`,
    tried_before: `Стоимость часа: ${rate} руб`
  });

  await ctx.reply(
    `📊 *Вот твой расчёт:*\n\n` +
    `👥 Партнёров в сети: *${partners}*\n` +
    `📐 Уровней вознаграждения: *${levels}*\n` +
    `⏱ Часов на расчёты в месяц: *${hours}*\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `💸 *Ты тратишь каждый месяц:*\n` +
    `  На расчёты: ~${monthlyCost.toLocaleString('ru')} руб\n` +
    (hasErrors ? `  Риск ошибок: ~${errorCost.toLocaleString('ru')} руб\n` : '') +
    `  *Итого: ~${totalMonthly.toLocaleString('ru')} руб/мес*\n` +
    `  *В год: ~${yearlyCost.toLocaleString('ru')} руб*\n\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🔢 *Мини-демо — как выглядит автоматический расчёт:*\n\n` +
    `Сделка на ${demoSale.toLocaleString('ru')} ₽\n` +
    `→ Партнёр 1 уровня получает: *+${demoBonus.toLocaleString('ru')} ₽* автоматически\n` +
    `→ Его ментор (уровень 2): *+${Math.round(demoBonus * 0.5).toLocaleString('ru')} ₽*\n` +
    `→ Всё это без Excel, без звонков, без ошибок\n\n` +
    `📱 Партнёр видит начисление в реальном времени в приложении`,
    { parse_mode: 'Markdown' }
  );

  // Небольшая пауза перед следующим сообщением
  setTimeout(async () => {
    await ctx.reply(
      `🎯 *Предложение:*\n\n` +
      `Мы настроим платформу *бесплатно на 30 дней* специально под твою сеть (${partners} партнёров, ${levels} уровней).\n\n` +
      `Никакого риска — просто покажем как это работает на твоих данных.\n\n` +
      `Хочешь попробовать?`,
      { parse_mode: 'Markdown', ...kb.pilotOfferKeyboard }
    );
    setStep(telegramId, 'pilot_offer');
  }, 1500);
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
    userData.botUsername = ctx.botInfo?.username || 'universal_posts_bot';
    const post = await generatePost(postType, userData);
    const genId = db.saveGeneration(telegramId, postType, userData.topic, userData.social_network, post);
    setState(telegramId, { current_gen_id: genId });

    await ctx.telegram.deleteMessage(telegramId, loadingMsg.message_id).catch(() => {});

    // Делаем первую строку жирной
    const formattedPost = formatPost(post);

    await ctx.reply(
      `📝 *Пост ${index + 1} из 4 — ${postType.toUpperCase()}*\n\n${formattedPost}\n\n⭐️ Оцени пост:`,
      { parse_mode: 'Markdown', ...kb.ratingKeyboard(genId) }
    );
  } catch (e) {
    console.error('Ошибка генерации:', e.message);
    await ctx.telegram.deleteMessage(telegramId, loadingMsg.message_id).catch(() => {});
    const { Markup } = require('telegraf');
    await ctx.reply(
      '⚠️ GigaChat не ответил — попробуй ещё раз',
      Markup.inlineKeyboard([[Markup.button.callback(`🔄 Попробовать ещё раз`, `next_${index}`)]])
    );
  }
}

async function showFinalScreen(ctx) {
  const telegramId = ctx.from.id;
  const user = db.getUser(telegramId);
  const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.referral_code}`;
  const segment = user.segment || state?.segment || 'general';

  // Финальный экран для бизнес-сегмента — воронка Deepinvol
  if (user.user_type === 'business') {
    await ctx.reply(
      `✅ Все 4 поста готовы!\n\nТеперь главное — когда партнёры начнут откликаться на твои посты, тебе понадобится система для работы с ними: онбординг, обучение, выплаты комиссий.\n\n*Мы строим именно такую платформу — Deepinvol.*\n\nСейчас набираем первых 20 компаний на особых условиях входа. Хочешь попасть в список?`,
      { parse_mode: 'Markdown', ...kb.deepinvolKeyboard }
    );
  } else {
    await ctx.reply(
      `✅ Все 4 поста готовы!\n\nХочешь получать такие посты регулярно по всем темам?`,
      kb.finalKeyboard
    );
  }

  // Объяснение вирального механизма
  await ctx.reply(
    `💡 *Как твои посты приводят новых читателей в бота*\n\n` +
    `В каждый пост мы незаметно вшиваем приглашение — последняя строка со ссылкой на бота.\n\n` +
    `Схема простая:\n` +
    `1. Ты публикуешь пост\n` +
    `2. Читатель видит пост → думает "хочу так же"\n` +
    `3. Кликает ссылку в конце → попадает в бота\n` +
    `4. Ты получаешь *10 руб* за каждого кто оплатит подписку\n\n` +
    `Простой расчёт:\n` +
    `• 10 новых пользователей → *100 руб/мес*\n` +
    `• 50 → *500 руб/мес*\n` +
    `• 100 → *1 000 руб/мес*\n\n` +
    `Никаких продаж — просто публикуй посты как обычно.\n\n` +
    `Твоя реферальная ссылка:\n\`${refLink}\``,
    { parse_mode: 'Markdown' }
  );
}

// ─── Вспомогательные ─────────────────────────────────────
function buildUserData(user, state) {
  const u = user || {}; // защита от undefined
  return {
    name: u.name || state.name || 'автор',
    age: u.age || state.age,
    gender: u.gender || state.gender,
    user_type: u.user_type || state.user_type,
    interests: u.interests || state.interests,
    business_desc: u.business_desc || state.business_desc,
    social_network: u.social_network || state.social_network || 'Telegram',
    style: u.style || state.style || 'Дружелюбный',
    keywords: u.keywords || state.keywords || state.post_idea,
    topic: state.topic || u.keywords || 'развитие и успех',
    purchase_freq: u.purchase_freq,
    wants_partners: u.wants_partners
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
  const s = db.getStats();
  const nps = db.getNPSStats();
  const interviews = db.getInterviews();

  const topTopics = s.topTopics.map(t => `  • ${t.topic}: ${t.cnt}`).join('\n') || '  Пока нет';
  const topReferrers = s.topReferrers.length > 0
    ? s.topReferrers.map(r => `  • ${r.name || r.username || r.telegram_id}: ${r.referrals} чел. (платящих: ${r.paid_referrals})`).join('\n')
    : '  Пока нет';

  // WTP анализ из интервью
  const wtpYesCounts = {};
  interviews.forEach(i => { if (i.wtp_yes) wtpYesCounts[i.wtp_yes] = (wtpYesCounts[i.wtp_yes] || 0) + 1; });
  const wtpTop = Object.entries(wtpYesCounts).sort((a,b) => b[1]-a[1]).map(([k,v]) => `  • ${k}: ${v} чел.`).join('\n') || '  Пока нет';

  await ctx.reply(
    `📊 *Статистика бота*\n\n` +
    `👥 *Пользователи:*\n` +
    `  Всего: ${s.totalUsers}\n` +
    `  Бесплатных: ${s.freeUsers}\n` +
    `  Подписчиков: ${s.paidUsers}\n` +
    `  💰 Доход (расчётный): ${s.totalRevenue} руб.\n\n` +
    `📂 *Сегменты:*\n` +
    `  Обычные: ${s.segmentGeneral}\n` +
    `  Партнёры Shop (noshop): ${s.segmentNoshop}\n` +
    `  Бизнес-ветка: ${s.segmentBusiness}\n\n` +
    `⭐️ *NPS (${nps.total} ответов):*\n` +
    `  Индекс: ${nps.nps > 0 ? '+' : ''}${nps.nps}\n` +
    `  Средняя оценка: ${nps.avg}/10\n` +
    `  Промоутеры (9-10): ${nps.promoters}\n` +
    `  Нейтралы (7-8): ${nps.passives}\n` +
    `  Критики (0-6): ${nps.detractors}\n\n` +
    `📋 *Интервью бизнеса:* ${interviews.length}\n` +
    `💰 *WTP — точно купили бы:*\n${wtpTop}\n\n` +
    `🏢 *Лиды Deepinvol:* ${s.deepinvolLeads}\n\n` +
    `📝 *Генерации:*\n` +
    `  Всего: ${s.totalGenerations}\n` +
    `  Опубликовано: ${s.published}\n\n` +
    `🏆 *Топ тем:*\n${topTopics}\n\n` +
    `🤝 *Топ рефереры:*\n${topReferrers}`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = {
  handleStart, handleTypeChoice, handleTextInput,
  handleCallback, handleBalance, handleWithdraw, handleAdmin
};
