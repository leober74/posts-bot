// Хранит состояния диалогов в памяти (сбрасывается при перезапуске)
const states = {};

function getState(userId) {
  return states[userId] || {};
}

function setState(userId, data) {
  states[userId] = { ...states[userId], ...data };
}

function clearState(userId) {
  delete states[userId];
}

function getStep(userId) {
  return states[userId]?.step || null;
}

function setStep(userId, step) {
  setState(userId, { step });
}

module.exports = { getState, setState, clearState, getStep, setStep };
