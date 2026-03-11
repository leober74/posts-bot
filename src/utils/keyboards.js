const { Markup } = require('telegraf');

const typeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔹 Для себя (личный бренд)', 'type_personal')],
  [Markup.button.callback('🔸 Для бизнеса / привлечения партнёров', 'type_business')]
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
  { text: '💰 Нехватка денег / хочу больше зарабатывать', cb: 'int_money' },
  { text: '💪 Здоровье и энергия', cb: 'int_health' },
  { text: '✨ Внешность и уход', cb: 'int_beauty' },
  { text: '🤖 Освоить новые технологии (IT, нейросети)', cb: 'int_tech' },
  { text: '❤️ Помогать другим людям', cb: 'int_help' },
  { text: '✈️ Путешествовать и менять локации', cb: 'int_travel' },
  { text: '📚 Саморазвитие и образование', cb: 'int_edu' },
  { text: '🌿 Дом и уют', cb: 'int_home' },
  { text: '🚗 Авто, недвижимость', cb: 'int_auto' }
];

function buildInterestsKeyboard(selected = []) {
  const buttons = interestsList.map(item => {
    const isSelected = selected.includes(item.cb);
    return [Markup.button.callback(
      (isSelected ? '✅ ' : '') + item.text,
      item.cb
    )];
  });
  buttons.push([Markup.button.callback('✅ Готово', 'interests_done')]);
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
    [
      Markup.button.callback('1 😞', `rate_1_${genId}`),
      Markup.button.callback('2 😕', `rate_2_${genId}`),
      Markup.button.callback('3 😐', `rate_3_${genId}`),
      Markup.button.callback('4 😊', `rate_4_${genId}`),
      Markup.button.callback('5 🔥', `rate_5_${genId}`)
    ]
  ]);
}

function feedbackKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📏 Слишком длинно', 'fb_long')],
    [Markup.button.callback('🎨 Не в моём стиле', 'fb_style')],
    [Markup.button.callback('📊 Не хватает фактов', 'fb_facts')],
    [Markup.button.callback('📢 Слишком рекламно', 'fb_ads')],
    [Markup.button.callback('✏️ Другое (напишу сам)', 'fb_custom')]
  ]);
}

function nextPostKeyboard(genId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('▶️ Следующий пост', `next_${genId}`)],
    [Markup.button.callback('📣 Я опубликовал этот!', `published_${genId}`)]
  ]);
}

const finalKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('💎 Подписка 490 руб/мес', 'subscribe')],
  [Markup.button.callback('📞 Связаться с экспертом', 'contact_expert')],
  [Markup.button.callback('💬 Задать вопрос', 'ask_question')]
]);

const skipKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('⏭ Пропустить', 'skip')]
]);

const continueKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('➡️ Продолжить', 'continue')]
]);

module.exports = {
  typeKeyboard, ageKeyboard, genderKeyboard,
  buildInterestsKeyboard, interestsList,
  topicsKeyboard, socialKeyboard, styleKeyboard,
  purchaseFreqKeyboard, partnersKeyboard,
  ratingKeyboard, feedbackKeyboard, nextPostKeyboard,
  finalKeyboard, skipKeyboard, continueKeyboard
};
