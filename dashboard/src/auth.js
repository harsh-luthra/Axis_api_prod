const KEY_STORAGE = 'axis_api_key';
const ME_STORAGE = 'axis_me';

export function getApiKey() {
  return localStorage.getItem(KEY_STORAGE);
}

export function setApiKey(key) {
  localStorage.setItem(KEY_STORAGE, key);
}

export function clearAuth() {
  localStorage.removeItem(KEY_STORAGE);
  localStorage.removeItem(ME_STORAGE);
}

export function getCachedMe() {
  const raw = localStorage.getItem(ME_STORAGE);
  return raw ? JSON.parse(raw) : null;
}

export function setCachedMe(me) {
  localStorage.setItem(ME_STORAGE, JSON.stringify(me));
}
