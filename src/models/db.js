const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../data/bot.db'));

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      name TEXT,
      age TEXT,
      gender TEXT,
      user_type TEXT,
      interests TEXT,
      social_network TEXT,
      style TEXT,
      keywords TEXT,
      business_desc TEXT,
      purchase_freq TEXT,
      wants_partners TEXT,
      profile_url TEXT,
      status TEXT DEFAULT 'free',
      balance REAL DEFAULT 0,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      post_type TEXT,
      topic TEXT,
      social_network TEXT,
      content TEXT,
      rating INTEGER,
      published INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS topics_used (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ База данных инициализирована');
}

// USERS
function getUser(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(telegramId));
}

function createUser(telegramId, username) {
  const refCode = 'ref_' + telegramId;
  db.prepare(`
    INSERT OR IGNORE INTO users (telegram_id, username, referral_code)
    VALUES (?, ?, ?)
  `).run(String(telegramId), username || '', refCode);
  return getUser(telegramId);
}

function updateUser(telegramId, fields) {
  const keys = Object.keys(fields);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  values.push(String(telegramId));
  db.prepare(`UPDATE users SET ${setClause} WHERE telegram_id = ?`).run(...values);
}

function getUserByRefCode(refCode) {
  return db.prepare('SELECT * FROM users WHERE referral_code = ?').get(refCode);
}

function addBalance(telegramId, amount) {
  db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?')
    .run(amount, String(telegramId));
}

// GENERATIONS
function saveGeneration(telegramId, postType, topic, socialNetwork, content) {
  db.prepare(`
    INSERT INTO generations (telegram_id, post_type, topic, social_network, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(telegramId), postType, topic, socialNetwork, content);
  return db.prepare('SELECT last_insert_rowid() as id').get().id;
}

function updateRating(generationId, rating) {
  db.prepare('UPDATE generations SET rating = ? WHERE id = ?').run(rating, generationId);
}

function markPublished(generationId) {
  db.prepare('UPDATE generations SET published = 1 WHERE id = ?').run(generationId);
}

// TOPICS
function getUsedTopics(telegramId) {
  const rows = db.prepare('SELECT topic FROM topics_used WHERE telegram_id = ?').all(String(telegramId));
  return rows.map(r => r.topic);
}

function addUsedTopic(telegramId, topic) {
  db.prepare('INSERT INTO topics_used (telegram_id, topic) VALUES (?, ?)').run(String(telegramId), topic);
}

// ANALYTICS
function getStats() {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalGenerations = db.prepare('SELECT COUNT(*) as c FROM generations').get().c;
  const published = db.prepare('SELECT COUNT(*) as c FROM generations WHERE published = 1').get().c;
  const topTopics = db.prepare(`
    SELECT topic, COUNT(*) as cnt FROM generations GROUP BY topic ORDER BY cnt DESC LIMIT 5
  `).all();
  return { totalUsers, totalGenerations, published, topTopics };
}

module.exports = {
  initDB, getUser, createUser, updateUser, getUserByRefCode,
  addBalance, saveGeneration, updateRating, markPublished,
  getUsedTopics, addUsedTopic, getStats
};
