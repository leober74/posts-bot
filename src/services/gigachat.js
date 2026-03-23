async function generatePost(prompt) {
  console.log("generatePost работает");

  return `🔥 Тестовый пост:

Ты написал: ${prompt}

Бот работает!`;
}

module.exports = { generatePost };
