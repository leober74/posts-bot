const axios = require('axios');
const db = require('../models/db');

const TOCHKA_API = 'https://enter.tochka.com/uapi/acquiring/v1.0';
const WEBHOOK_API = 'https://enter.tochka.com/uapi/webhook/v1.0';
const CUSTOMER_CODE = process.env.TOCHKA_CUSTOMER_CODE || '300853337';

function getToken() { return process.env.TOCHKA_TOKEN; }
function getClientId() { return process.env.TOCHKA_CLIENT_ID; }

async function registerWebhook(botUrl) {
  try {
    const clientId = getClientId();
    const token = getToken();
    if (!clientId || !token) {
      console.log('⚠️ TOCHKA_TOKEN или TOCHKA_CLIENT_ID не заданы — webhook не зарегистрирован');
      return;
    }
    const webhookUrl = `${botUrl}/payment/callback`;
    const response = await axios.put(
      `${WEBHOOK_API}/${clientId}`,
      {
        webhooksList: ['acquiringInternetPayment'],
        url: webhookUrl
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    console.log(`✅ Webhook зарегистрирован: ${webhookUrl}`);
    return response.data;
  } catch (e) {
    console.error('Ошибка регистрации webhook:', e.response?.data || e.message);
  }
}

async function createPaymentLink(telegramId) {
  try {
    const response = await axios.post(
      `${TOCHKA_API}/payment_link`,
      {
        customerCode: CUSTOMER_CODE,
        amount: 100,
        purpose: 'Подписка на бота (1 месяц)',
        consumerId: String(telegramId),
        redirectUrl: 'https://t.me/universal_posts_bot',
        saveCard: false
      },
      {
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data?.paymentLink || null;
  } catch (e) {
    console.error('Ошибка создания платёжной ссылки:', e.message);
    return null;
  }
}

async function handlePaymentWebhook(bot, jwtToken) {
  try {
    const parts = jwtToken.split('.');
    if (parts.length < 2) throw new Error('Неверный JWT');

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    );

    console.log('💳 Webhook от Точки:', JSON.stringify(payload));

    const status = payload.status;
    const telegramId = payload.consumerId;
    const amount = payload.amount;

    if (!telegramId) {
      console.error('Webhook: нет consumerId');
      return false;
    }

    if (status !== 'APPROVED') {
      console.log(`Webhook: статус ${status} — игнорируем`);
      return false;
    }

    const user = db.getUser(telegramId);
    if (!user) {
      console.error(`Webhook: пользователь ${telegramId} не найден`);
      return false;
    }

    // ✅ Используем activateSubscription — она сама ставит дату +30 дней
    const untilDate = db.activateSubscription(telegramId);
    const untilFormatted = new Date(untilDate).toLocaleDateString('ru-RU');

    // Начисляем реферальный бонус
    if (user.referred_by) {
      const referrer = db.getUserByRefCode(user.referred_by);
      if (referrer) {
        db.addBalance(referrer.telegram_id, 10);
        await bot.telegram.sendMessage(
          referrer.telegram_id,
          `🎉 По твоей ссылке кто-то оформил подписку!\n\n+10 руб начислено на твой баланс 💰`
        ).catch(() => {});
      }
    }

    // Уведомляем пользователя
    await bot.telegram.sendMessage(
      telegramId,
      `✅ *Подписка активирована!*\n\n` +
      `Действует до: *${untilFormatted}*\n\n` +
      `Теперь у тебя:\n` +
      `• Неограниченные генерации по всем темам\n` +
      `• Повторная генерация уже использованных тем\n` +
      `• Реферальные начисления за приглашённых\n` +
      `• Все будущие функции автоматически\n\n` +
      `Напиши /start чтобы начать 🚀`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    // Уведомляем админа
    await bot.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `💳 НОВАЯ ОПЛАТА!\n\n` +
      `👤 @${user.username || telegramId}\n` +
      `💰 Сумма: ${amount} руб\n` +
      `📅 Подписка до: ${untilFormatted}\n` +
      `✅ Активировано`
    ).catch(() => {});

    console.log(`✅ Подписка активирована для ${telegramId} до ${untilFormatted}`);
    return true;

  } catch (e) {
    console.error('Ошибка обработки webhook:', e.message);
    return false;
  }
}

module.exports = { createPaymentLink, handlePaymentWebhook, registerWebhook };
