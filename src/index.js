require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

// Создаём папку для БД если нет
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = require('./models/db');
const handlers = require('./handlers/main');

db.initDB();

const bot = new Telegraf(process.env.BOT_TOKEN);

// ─── Команды ──────────────────────────────────────────────
bot.start(handlers.handleStart);
bot.command('balance', handlers.handleBalance);
bot.command('withdraw', handlers.handleWithdraw);
bot.command('admin', handlers.handleAdmin);
bot.command('help', (ctx) => ctx.reply(
  '📋 *Команды бота:*\n\n/start — начать заново\n/balance — мой баланс\n/withdraw — вывести деньги\n\nДля вопросов: используй кнопку «Задать вопрос» после генерации постов.',
  { parse_mode: 'Markdown' }
));

// ─── Текстовые сообщения ───────────────────────────────────
bot.on('text', handlers.handleTextInput);

// ─── Callback кнопки ──────────────────────────────────────
bot.on('callback_query', handlers.handleCallback);

// ─── Голосовые (заглушка) ─────────────────────────────────
bot.on('voice', (ctx) => ctx.reply('🎤 Голосовые сообщения пока не поддерживаются. Напиши текстом!'));

// ─── Ошибки ───────────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`Ошибка для пользователя ${ctx.from?.id}:`, err.message);
  ctx.reply('Что-то пошло не так. Попробуй /start').catch(() => {});
});

// ─── Запуск ───────────────────────────────────────────────
bot.launch()
  .then(() => console.log('🤖 Бот запущен!'))
  .catch(err => {
    if (err.message && err.message.includes('409')) {
      console.error('⚠️ Уже запущен другой экземпляр бота (409). Останавливаемся.');
      process.exit(0); // exit(0) = не ошибка, Railway не перезапустит
    }
    console.error('Ошибка запуска:', err.message);
    process.exit(1);
  });

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
