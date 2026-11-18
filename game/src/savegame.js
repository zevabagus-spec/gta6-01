// Save / load with validation. A corrupt, partial or foreign save is discarded
// and the game starts fresh instead of crashing; when localStorage is
// unavailable (private mode, quota) an in-memory fallback keeps autosave
// working for the session.
export const SAVE_KEY = 'solmar-heat-save-v1';
export const SAVE_VERSION = 1;

const memoryFallback = { text: null };

function storageAvailable() {
  try {
    const probe = '__solmar_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch (err) {
    return false;
  }
}

function readRaw() {
  try {
    if (storageAvailable()) return window.localStorage.getItem(SAVE_KEY);
  } catch (err) { /* fall through to memory */ }
  return memoryFallback.text;
}

function writeRaw(text) {
  try {
    if (storageAvailable()) {
      window.localStorage.setItem(SAVE_KEY, text);
      return true;
    }
  } catch (err) { /* fall through to memory */ }
  memoryFallback.text = text;
  return true;
}

export function defaultSaveData() {
  return {
    version: SAVE_VERSION,
    cash: 120,
    missionIndex: 0,
    completedMissions: [],
    collectedCoins: [],
    health: 100,
    ammo: 24,
    reserveAmmo: 48,
    kills: 0,
    carsStolen: 0,
    coinsFound: 0,
    storyDone: false,
    playerX: 0,
    playerZ: 30,
    playSeconds: 0,
  };
}

function isValidSave(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (parsed.version !== SAVE_VERSION) return false;
  if (!Number.isFinite(parsed.cash) || parsed.cash < 0 || parsed.cash > 10000000) return false;
  if (!Number.isInteger(parsed.missionIndex) || parsed.missionIndex < 0 || parsed.missionIndex > 6) return false;
  if (!Array.isArray(parsed.completedMissions) || !Array.isArray(parsed.collectedCoins)) return false;
  if (!Number.isFinite(parsed.playerX) || !Number.isFinite(parsed.playerZ)) return false;
  if (Math.abs(parsed.playerX) > 500 || Math.abs(parsed.playerZ) > 500) return false;
  return true;
}

export function loadSaveData() {
  const raw = readRaw();
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  if (!isValidSave(parsed)) return null;
  const fresh = defaultSaveData();
  const health = Number.isFinite(parsed.health) ? parsed.health : 100;
  const ammo = Number.isFinite(parsed.ammo) ? parsed.ammo : 24;
  const reserveAmmo = Number.isFinite(parsed.reserveAmmo) ? parsed.reserveAmmo : 48;
  return {
    ...fresh,
    ...parsed,
    completedMissions: parsed.completedMissions.filter((n) => Number.isInteger(n) && n >= 0 && n < 6),
    collectedCoins: parsed.collectedCoins.filter((n) => Number.isInteger(n) && n >= 0 && n < 20),
    health: Math.max(1, Math.min(100, health)),
    ammo: Math.max(0, Math.min(999, ammo)),
    reserveAmmo: Math.max(0, Math.min(999, reserveAmmo)),
  };
}

export function saveGameData(data) {
  const payload = { ...defaultSaveData(), ...data, version: SAVE_VERSION };
  try {
    return writeRaw(JSON.stringify(payload));
  } catch (err) {
    return false;
  }
}

export function clearSaveData() {
  try {
    if (storageAvailable()) window.localStorage.removeItem(SAVE_KEY);
  } catch (err) { /* ignore */ }
  memoryFallback.text = null;
}

export function hasSaveData() {
  return loadSaveData() !== null;
}
