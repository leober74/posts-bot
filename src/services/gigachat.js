const GigaChat = require('gigachat');
const { Agent } = require('node:https');

const httpsAgent = new Agent({ rejectUnauthorized: false });

const client = new GigaChat({
  httpsAgent: httpsAgent,
  timeout: 60,
});

async function generatePost(prompt) {
  try {
    const response = await client.chat({
      messages: [
        {
          role: 'system',
          content: 'Ты эксперт по нейромаркетингу. Пиши посты по структуре AIDA (крючок, проблема, решение, доказательства, призыв, вопрос).',
        },
        { role: 'user', content: prompt },
      ],
    });
    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('GigaChat error:', error);
    throw error;
  }
}

async function regeneratePost(originalPrompt, userFeedback) {
  const newPrompt = `Исходный запрос: "${originalPrompt}". Пожелание: "${userFeedback}". Сгенерируй улучшенный пост.`;
  return generatePost(newPrompt);
}

module.exports = { generatePost, regeneratePost };
