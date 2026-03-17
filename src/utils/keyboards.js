const { Markup } = require('telegraf');

const typeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔹 Для себя — личный бренд и экспертиза', 'type_personal')],
  [Markup.button.callback('🏢 Есть бизнес — хочу партнёрскую сеть', 'type_business')]
]);

// Квалификационные вопросы для бизнес-ветки
const qualLegalKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Да, есть ИП или ООО', 'qual_legal_yes')],
  [Markup.button.callback('⏳ Пока нет, в процессе', 'qual_legal_no')]
]);

const qualRepeatKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔄 Да, покупают регулярно / подписка', 'qual_repeat_yes')],
  [Markup.button.callback('🛍 В основном разовые покупки', 'qual_repeat_mid')],
  [Markup.button.callback('🧪 Пока тестируем модель', 'qual_repeat_no')]
]);

const qualRevenueKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📊 До 300 000 ₽/мес', 'qual_rev_low')],
  [Markup.button.callback('📈 300 000 – 1 000 000 ₽/мес', 'qual_rev_mid')],
  [Markup.button.callback('🚀 Больше 1 000 000 ₽/мес', 'qual_rev_high')]
]);

const ageKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('до 18', 'age_under18'), Markup.button.callback('18–25', 'age_18_25')],
  [Markup.button.callback('26–35', 'age_26_35'), Markup.button.callback('36–45', 'age_36_45')],
  [Markup.button.callback('46–60', 'age_46_60'), Markup.button.callback('60+', 'age_60plus')]
]);

const genderKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Мужской', 'gender_male'), Markup.button.callback('Женский', 'gender_female')]
]);

const interestsList = [
  { text: 'Нехватка денег / хочу больше зарабатывать', emoji: '💰', cb: 'int_money' },
  { text: 'Здоровье и энергия', emoji: '💪', cb: 'int_health' },
  { text: 'Внешность и уход', emoji: '✨', cb: 'int_beauty' },
  { text: 'Освоить новые технологии (IT, нейросети)', emoji: '🤖', cb: 'int_tech' },
  { text: 'Помогать другим людям', emoji: '❤️', cb: 'int_help' },
  { text: 'Путешествовать и менять локации', emoji: '✈️', cb: 'int_travel' },
  { text: 'Саморазвитие и образование', emoji: '📚', cb: 'int_edu' },
  { text: 'Дом и уют', emoji: '🌿', cb: 'int_home' },
  { text: 'Авто, недвижимость', emoji: '🚗', cb: 'int_auto' }
];

function buildInterestsKeyboard(selected = [], frozen = false) {
  const buttons = interestsList.map(item => {
    const isSelected = selected.includes(item.cb);
    const label = isSelected
      ? `✅ ${item.text} ${item.emoji}`
      : `${item.text} ${item.emoji}`;
    return [Markup.button.callback(label, frozen ? 'noop' : item.cb)];
  });
  if (!frozen) {
    buttons.push([Markup.button.callback('— — — — — — — — —', 'noop')]);
    buttons.push([Markup.button.callback('🟢 ГОТОВО — продолжить →', 'interests_done')]);
  }
  return Markup.inlineKeyboard(buttons);
}

const topicsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('💸 Экономия и скидки', 'topic_economy')],
  [Markup.button.callback('💼 Дополнительный доход', 'topic_income')],
  [Markup.button.callback('📈 Инвестиции', 'topic_invest')],
  [Markup.button.callback('🤖 IT и нейросети', 'topic_tech')],
  [Markup.button.callback('💆 Здоровье и красота', 'topic_health')],
  [Markup.button.callback('🏠 Дом и семья', 'topic_home')],
  [Markup.button.callback('🚗 Авто и недвижимость', 'topic_auto')]
]);

const socialKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('ВКонтакте', 'sn_vk'), Markup.button.callback('Telegram', 'sn_tg')],
  [Markup.button.callback('Instagram', 'sn_ig'), Markup.button.callback('Другое', 'sn_other')]
]);

const styleKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('😊 Дружелюбный', 'style_friendly'), Markup.button.callback('🎓 Экспертный', 'style_expert')],
  [Markup.button.callback('🔥 Дерзкий', 'style_bold'), Markup.button.callback('🌟 Вдохновляющий', 'style_inspire')]
]);

const purchaseFreqKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Один раз', 'pf_once')],
  [Markup.button.callback('Несколько раз в год', 'pf_yearly')],
  [Markup.button.callback('Ежемесячная подписка', 'pf_monthly')],
  [Markup.button.callback('Другое', 'pf_other')]
]);

const partnersKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Да, хочу партнёров', 'partners_yes')],
  [Markup.button.callback('Нет, пока нет', 'partners_no')]
]);

function ratingKeyboard(genId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('1 😞 Не буду выкладывать', `rate_1_${genId}`)],
    [Markup.button.callback('2 🤔 Для начала пойдёт', `rate_2_${genId}`)],
    [Markup.button.callback('3 ✏️ Давай переделаем', `rate_3_${genId}`)],
    [Markup.button.callback('4 😊 Неплохо, выложу', `rate_4_${genId}`)],
    [Markup.button.callback('5 🔥 Огонь, публикую!', `rate_5_${genId}`)]
  ]);
}

function feedbackKeyboard() {
  // Полный пул вариантов
  const pool = [
    { text: '📏 Слишком длинно — сократи', cb: 'fb_long' },
    { text: '📝 Слишком коротко — раскрой', cb: 'fb_short' },
    { text: '🎨 Не мой стиль — другой тон', cb: 'fb_style' },
    { text: '📊 Нет конкретики — добавь факты', cb: 'fb_facts' },
    { text: '📢 Слишком рекламно — помягче', cb: 'fb_ads' },
    { text: '💡 Не та идея — другой угол', cb: 'fb_angle' },
    { text: '🔥 Скучно — сделай живее', cb: 'fb_boring' },
    { text: '😐 Заголовок слабый — придумай лучше', cb: 'fb_title' },
    { text: '🎯 Не про мою аудиторию — перепиши', cb: 'fb_audience' },
    { text: '💬 Нет вовлечения — добавь вопрос', cb: 'fb_engage' },
  ];

  // Перемешиваем и берём 5 случайных + всегда оставляем "объясню сам"
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 5);
  const buttons = shuffled.map(item => [Markup.button.callback(item.text, item.cb)]);
  buttons.push([Markup.button.callback('✏️ Объясню сам что изменить', 'fb_custom')]);
  return Markup.inlineKeyboard(buttons);
}

function publishGuideKeyboard(genId, socialNetwork) {
  const guides = {
    'ВКонтакте': [
      [Markup.button.callback('📋 Как опубликовать во ВКонтакте', `guide_vk_${genId}`)],
    ],
    'Telegram': [
      [Markup.button.callback('📋 Как опубликовать в Telegram', `guide_tg_${genId}`)],
    ],
    'Instagram': [
      [Markup.button.callback('📋 Как опубликовать в Instagram', `guide_ig_${genId}`)],
    ]
  };
  const guideBtn = guides[socialNetwork] || [[Markup.button.callback('📋 Как скопировать и опубликовать', `guide_other_${genId}`)]];
  return Markup.inlineKeyboard([
    ...guideBtn,
    [Markup.button.callback('▶️ Следующий пост', `next_${genId}`)],
    [Markup.button.callback('📣 Уже опубликовал!', `published_${genId}`)]
  ]);
}

function nextPostKeyboard(genId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('▶️ Следующий пост', `next_${genId}`)],
    [Markup.button.callback('📣 Уже опубликовал!', `published_${genId}`)]
  ]);
}

const finalKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('💎 Оформить подписку — 100 руб/мес', 'subscribe')],
  [Markup.button.callback('💬 Задать вопрос', 'ask_question')]
]);

const skipKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('⏭ Пропустить', 'skip')]
]);

const continueKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('➡️ Продолжить', 'continue')]
]);

// Вопрос про ошибки в расчётах
const calcErrorsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Да, были ошибки / конфликты', 'calc_errors_yes')],
  [Markup.button.callback('🟢 Нет, всё чисто', 'calc_errors_no')]
]);

// Оффер пилота
const pilotOfferKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Да, хочу бесплатный пилот', 'pilot_yes')],
  [Markup.button.callback('❓ Есть вопросы', 'pilot_questions')],
  [Markup.button.callback('⏳ Позже, сначала посты', 'pilot_later')]
]);

// Фильтр для партнёров Shop
const partnerFilterKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Да, уже работаю с партнёрской программой', 'pf_has_partner')],
  [Markup.button.callback('🏢 Есть свой бизнес, ищу партнёров', 'pf_has_business')],
  [Markup.button.callback('🔍 Нет, ищу возможности', 'pf_no_partner')]
]);

// Воронка Deepinvol для бизнес-ветки
const deepinvolKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Да, хочу попасть в первые 20', 'deepinvol_join')],
  [Markup.button.callback('📋 Расскажи подробнее о платформе', 'deepinvol_info')],
  [Markup.button.callback('⏭ Позже', 'noop')]
]);

// Интервью — предложение пройти
const interviewOfferKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Да, пройду (2 минуты)', 'interview_start')],
  [Markup.button.callback('⏭ Пропустить', 'interview_skip')]
]);

// WTP ценники
const wtpYesKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('до 5 000 ₽/мес', 'wtp_yes_5k')],
  [Markup.button.callback('5 000 – 15 000 ₽/мес', 'wtp_yes_15k')],
  [Markup.button.callback('15 000 – 30 000 ₽/мес', 'wtp_yes_30k')],
  [Markup.button.callback('30 000 – 75 000 ₽/мес', 'wtp_yes_75k')],
  [Markup.button.callback('больше 75 000 ₽/мес', 'wtp_yes_75kplus')]
]);

const wtpMaybeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('до 5 000 ₽/мес', 'wtp_maybe_5k')],
  [Markup.button.callback('5 000 – 15 000 ₽/мес', 'wtp_maybe_15k')],
  [Markup.button.callback('15 000 – 30 000 ₽/мес', 'wtp_maybe_30k')],
  [Markup.button.callback('30 000 – 75 000 ₽/мес', 'wtp_maybe_75k')],
  [Markup.button.callback('больше 75 000 ₽/мес', 'wtp_maybe_75kplus')]
]);

const wtpNoKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('до 5 000 ₽/мес', 'wtp_no_5k')],
  [Markup.button.callback('5 000 – 15 000 ₽/мес', 'wtp_no_15k')],
  [Markup.button.callback('15 000 – 30 000 ₽/мес', 'wtp_no_30k')],
  [Markup.button.callback('30 000 – 75 000 ₽/мес', 'wtp_no_75k')],
  [Markup.button.callback('больше 75 000 ₽/мес', 'wtp_no_75kplus')]
]);

// NPS 0-10
function npsKeyboard() {
  return Markup.inlineKeyboard([
    [0,1,2,3,4].map(n => Markup.button.callback(`${n}`, `nps_${n}`)),
    [5,6,7,8,9].map(n => Markup.button.callback(`${n}`, `nps_${n}`)),
    [Markup.button.callback('10', 'nps_10')]
  ]);
}

module.exports = {
  typeKeyboard, ageKeyboard, genderKeyboard,
  buildInterestsKeyboard, interestsList,
  topicsKeyboard, socialKeyboard, styleKeyboard,
  purchaseFreqKeyboard, partnersKeyboard,
  ratingKeyboard, feedbackKeyboard, nextPostKeyboard, publishGuideKeyboard,
  finalKeyboard, skipKeyboard, continueKeyboard,
  qualLegalKeyboard, qualRepeatKeyboard, qualRevenueKeyboard,
  partnerFilterKeyboard, deepinvolKeyboard,
  interviewOfferKeyboard, wtpYesKeyboard, wtpMaybeKeyboard, wtpNoKeyboard, npsKeyboard,
  calcErrorsKeyboard, pilotOfferKeyboard
};
