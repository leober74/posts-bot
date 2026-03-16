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
      segment TEXT DEFAULT 'general',
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

    CREATE TABLE IF NOT EXISTS deepinvol_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      username TEXT,
      name TEXT,
      business_desc TEXT,
      contact TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      username TEXT,
      name TEXT,
      business_desc TEXT,
      main_problem TEXT,
      tried_before TEXT,
      wtp_yes TEXT,
      wtp_maybe TEXT,
      wtp_no TEXT,
      nps_score INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS nps_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      user_type TEXT,
      score INTEGER,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Добавляем колонку segment если её нет (для существующих БД)
  try { db.exec(`ALTER TABLE users ADD COLUMN segment TEXT DEFAULT 'general'`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN subscription_until TEXT`); } catch(e) {}

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
  const baseCode = refCode.replace(/_noshop$/, '').replace(/_deepinvol$/, '');
  return db.prepare('SELECT * FROM users WHERE referral_code = ?').get(baseCode);
}

function addBalance(telegramId, amount) {
  db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?')
    .run(amount, String(telegramId));
}

// ИНТЕРВЬЮ (бизнес-ветка)
function saveInterview(telegramId, data) {
  const user = getUser(telegramId);
  db.prepare(`
    INSERT INTO interviews
      (telegram_id, username, name, business_desc, main_problem, tried_before, wtp_yes, wtp_maybe, wtp_no, nps_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(telegramId),
    user?.username || '',
    data.name || user?.name || '',
    data.business_desc || user?.business_desc || '',
    data.main_problem || '',
    data.tried_before || '',
    data.wtp_yes || '',
    data.wtp_maybe || '',
    data.wtp_no || '',
    data.nps_score || null
  );
}

function getInterviews() {
  return db.prepare('SELECT * FROM interviews ORDER BY created_at DESC').all();
}

// NPS
function saveNPS(telegramId, userType, score, comment) {
  db.prepare(`
    INSERT INTO nps_scores (telegram_id, user_type, score, comment)
    VALUES (?, ?, ?, ?)
  `).run(String(telegramId), userType, score, comment || '');
}

function getNPSStats() {
  const all = db.prepare('SELECT score FROM nps_scores').all();
  if (!all.length) return { avg: 0, promoters: 0, detractors: 0, passives: 0, nps: 0, total: 0 };
  const promoters = all.filter(r => r.score >= 9).length;
  const detractors = all.filter(r => r.score <= 6).length;
  const passives = all.filter(r => r.score >= 7 && r.score <= 8).length;
  const total = all.length;
  const nps = Math.round(((promoters - detractors) / total) * 100);
  const avg = (all.reduce((s, r) => s + r.score, 0) / total).toFixed(1);
  return { avg, promoters, detractors, passives, nps, total };
}

// DEEPINVOL LEADS
function saveDeepinvolLead(telegramId, username, name, businessDesc, contact) {
  db.prepare(`
    INSERT INTO deepinvol_leads (telegram_id, username, name, business_desc, contact)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(telegramId), username || '', name || '', businessDesc || '', contact || '');
}

function getDeepinvolLeads() {
  return db.prepare('SELECT * FROM deepinvol_leads ORDER BY created_at DESC').all();
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
  const freeUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'free'").get().c;
  const paidUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'subscribed'").get().c;
  const totalGenerations = db.prepare('SELECT COUNT(*) as c FROM generations').get().c;
  const published = db.prepare('SELECT COUNT(*) as c FROM generations WHERE published = 1').get().c;
  const totalRevenue = paidUsers * 490;

  // По сегментам
  const segmentGeneral = db.prepare("SELECT COUNT(*) as c FROM users WHERE segment = 'general' OR segment IS NULL").get().c;
  const segmentNoshop = db.prepare("SELECT COUNT(*) as c FROM users WHERE segment = 'noshop'").get().c;
  const segmentBusiness = db.prepare("SELECT COUNT(*) as c FROM users WHERE segment = 'business'").get().c;

  // Реферальная статистика
  const topReferrers = db.prepare(`
    SELECT u.username, u.name, u.telegram_id, u.balance,
           COUNT(r.id) as referrals,
           SUM(CASE WHEN r.status = 'subscribed' THEN 1 ELSE 0 END) as paid_referrals
    FROM users u
    LEFT JOIN users r ON r.referred_by = u.referral_code
    GROUP BY u.telegram_id
    HAVING referrals > 0
    ORDER BY referrals DESC
    LIMIT 10
  `).all();

  const topTopics = db.prepare(`
    SELECT topic, COUNT(*) as cnt FROM generations GROUP BY topic ORDER BY cnt DESC LIMIT 5
  `).all();

  const deepinvolLeads = db.prepare('SELECT COUNT(*) as c FROM deepinvol_leads').get().c;

  return {
    totalUsers, freeUsers, paidUsers, totalRevenue,
    totalGenerations, published,
    segmentGeneral, segmentNoshop, segmentBusiness,
    topReferrers, topTopics, deepinvolLeads
  };
}

module.exports = {
  initDB, getUser, createUser, updateUser, getUserByRefCode,
  addBalance, saveGeneration, updateRating, markPublished,
  getUsedTopics, addUsedTopic, getStats,
  saveDeepinvolLead, getDeepinvolLeads,
  saveInterview, getInterviews,
  saveNPS, getNPSStats
};
