import GigaChat from 'gigachat';
import { Agent } from 'node:https';

// Создаем HTTPS-агента с отключенной проверкой сертификатов (как в переменной окружения)
// Это нужно, чтобы на Railway не было ошибок SSL [citation:2][citation:4]
const httpsAgent = new Agent({
  rejectUnauthorized: false,
});

// Инициализируем клиента GigaChat.
// Переменные окружения (GIGACHAT_CREDENTIALS, GIGACHAT_SCOPE и др.) подхватятся автоматически [citation:2]
const client = new GigaChat({
  httpsAgent: httpsAgent,
  timeout: 60, // Таймаут в секундах
});

// Функция для генерации одного поста на основе промпта
export async function generatePost(prompt) {
  try {
    const response = await client.chat({
      messages: [
        // Системный промпт (можно вынести в конфиг или оставить здесь)
        {
          role: 'system',
          content: 'Ты — эксперт по нейромаркетингу. Ты пишешь посты для социальных сетей, следуя структуре AIDA (крючок, проблема, решение, доказательства, призыв к действию, вовлекающий вопрос). Ты используешь только факты, не выдумываешь цифры и даты. Твой язык — русский, стиль — дружелюбный, если не указано иное.',
        },
        { role: 'user', content: prompt },
      ],
    });
    // Возвращаем только текст ответа
    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Ошибка при вызове GigaChat:', error);
    throw error; // Пробрасываем ошибку дальше, чтобы обработать её в main.js
  }
}

// Функция для перегенерации поста с учётом пожеланий
// Принимает исходный промпт и текст пожелания пользователя
export async function regeneratePost(originalPrompt, userFeedback) {
  const newPrompt = `Ты уже сгенерировал пост по запросу: "${originalPrompt}".\nПользователь дал следующий отзыв и просит переделать пост с его учётом:\n"${userFeedback}"\n\nСгенерируй новый, улучшенный пост.`;
  return generatePost(newPrompt); // Используем ту же функцию с новым промптом
}
