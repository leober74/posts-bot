require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = require('./models/db');
const handlers = require('./handlers/main');
const { handlePaymentWebhook, registerWebhook, createPaymentLink } = require('./services/payment');

db.initDB();

const bot = new Telegraf(process.env.BOT_TOKEN);

// ─── Express для webhook ───────────────────────────────────
const app = express();
app.use(express.text({ type: '*/*' }));

app.post('/payment/callback', async (req, res) => {
  console.log('💳 Входящий webhook от Точки');
  try {
    const jwtToken = typeof req.body === 'string' ? req.body.trim() : '';
    if (!jwtToken) {
      console.error('Webhook: пустое тело');
      return res.status(400).send('Bad Request');
    }
    await handlePaymentWebhook(bot, jwtToken);
    res.status(200).send('OK');
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.status(500).send('Error');
  }
});

app.get('/health', (req, res) => res.send('OK'));

// ─── Команды ──────────────────────────────────────────────
bot.start(handlers.handleStart);
bot.command('balance', handlers.handleBalance);
bot.command('withdraw', handlers.handleWithdraw);
bot.command('admin', handlers.handleAdmin);
bot.command('help', (ctx) => ctx.reply(
  '📋 *Команды бота:*\n\n/start — начать заново\n/balance — мой баланс\n/withdraw — вывести деньги\n\nДля вопросов: используй кнопку «Задать вопрос» после генерации постов.',
  { parse_mode: 'Markdown' }
));

bot.on('text', handlers.handleTextInput);
bot.on('callback_query', handlers.handleCallback);
bot.on('voice', (ctx) => ctx.reply('🎤 Голосовые сообщения пока не поддерживаются. Напиши текстом!'));

bot.catch((err, ctx) => {
  console.error(`Ошибка для пользователя ${ctx.from?.id}:`, err.message);
  ctx.reply('Что-то пошло не так. Попробуй /start').catch(() => {});
});

// ─── Ежедневная проверка подписок ─────────────────────────
async function checkSubscriptions() {
  try {
    // 1. Деактивируем истёкшие подписки
    const expired = db.getExpiredSubscriptions();
    for (const user of expired) {
      db.updateUser(user.telegram_id, { status: 'free' });
      try {
        await bot.telegram.sendMessage(
          user.telegram_id,
          `⏰ *Твоя подписка истекла*\n\nТы снова на бесплатном тарифе — доступна одна тема.\n\nЧтобы вернуть все возможности — продли подписку за 100 руб 👇`,
          {
            parse_mode: 'Markdown',
            ...require('telegraf').Markup.inlineKeyboard([
              [require('telegraf').Markup.button.callback('💎 Продлить подписку — 100 руб', 'subscribe')]
            ])
          }
        );
      } catch (e) {
        console.error(`Не удалось уведомить ${user.telegram_id} об истечении:`, e.message);
      }
    }

    // 2. Напоминаем тем у кого осталось 3 дня
    const expiring = db.getUsersExpiringIn(3);
    for (const user of expiring) {
      try {
        const payLink = await createPaymentLink(user.telegram_id).catch(() => null);
        const { Markup } = require('telegraf');
        const keyboard = payLink
          ? Markup.inlineKeyboard([[Markup.button.url('💳 Продлить за 100 руб', payLink)]])
          : Markup.inlineKeyboard([[Markup.button.callback('💎 Продлить подписку', 'subscribe')]]);

        await bot.telegram.sendMessage(
          user.telegram_id,
          `⏰ *Подписка заканчивается через 3 дня!*\n\nБез подписки закроются:\n• Генерация постов по всем темам\n• Реферальные начисления — 10 руб за каждого приглашённого\n• Приоритетная поддержка\n\nПродли за 100 руб — и всё остаётся как есть 👇`,
          { parse_mode: 'Markdown', ...keyboard }
        );
      } catch (e) {
        console.error(`Не удалось уведомить ${user.telegram_id} о скором истечении:`, e.message);
      }
    }

    if (expired.length > 0 || expiring.length > 0) {
      console.log(`✅ Проверка подписок: деактивировано ${expired.length}, напомнено ${expiring.length}`);
    }
  } catch (e) {
    console.error('Ошибка проверки подписок:', e.message);
  }
}

// ─── Запуск ───────────────────────────────────────────────
bot.launch()
  .then(() => {
    console.log('🤖 Бот запущен!');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🌐 Webhook сервер запущен на порту ${PORT}`);
      const botUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'web-production-e908a.up.railway.app'}`;
      console.log(`🔗 Регистрируем webhook на: ${botUrl}/payment/callback`);
      console.log(`🔑 TOCHKA_TOKEN задан: ${!!process.env.TOCHKA_TOKEN}`);
      console.log(`🔑 TOCHKA_CLIENT_ID задан: ${!!process.env.TOCHKA_CLIENT_ID}`);
      registerWebhook(botUrl);
    });

    // Запускаем проверку подписок каждые 24 часа
    setInterval(checkSubscriptions, 24 * 60 * 60 * 1000);
    // И сразу при старте
    checkSubscriptions();
  })
  .catch(err => {
    if (err.message && err.message.includes('409')) {
      console.error('⚠️ Уже запущен другой экземпляр бота (409). Останавливаемся.');
      process.exit(0);
    }
    console.error('Ошибка запуска:', err.message);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
