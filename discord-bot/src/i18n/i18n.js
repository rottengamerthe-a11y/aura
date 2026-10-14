const fs = require('fs');
const path = require('path');

// Loaded locale data
const locales = new Map();
const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = ['en', 'es', 'pt', 'fr'];

// User locale preferences (in-memory, synced from user.locale field)
const userLocales = new Map();

// Load a locale file
function loadLocale(locale) {
  const filePath = path.join(__dirname, 'locales', `${locale}.json`);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    locales.set(locale, data);
    return true;
  } catch (err) {
    console.warn(`[i18n] Failed to load locale: ${locale}`, err.message);
    return false;
  }
}

// Initialize — load all supported locales
function init() {
  for (const locale of SUPPORTED_LOCALES) {
    loadLocale(locale);
  }
  console.log(`[i18n] Loaded ${locales.size} locales: ${[...locales.keys()].join(', ')}`);
}

// Get a translated string with interpolation
// Usage: t('en', 'commands.work.success', { amount: 150, job: 'Mining' })
function t(locale, key, params = {}) {
  const lang = locales.get(locale) || locales.get(DEFAULT_LOCALE);
  if (!lang) return key; // fallback to key
  
  // Navigate nested keys: 'commands.work.success'
  const parts = key.split('.');
  let value = lang;
  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) break;
  }
  
  // Fallback to English, then to key itself
  if (value === undefined) {
    const enLang = locales.get(DEFAULT_LOCALE);
    value = enLang;
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) break;
    }
  }
  
  if (typeof value !== 'string') return key;
  
  // Interpolate {param} placeholders
  return value.replace(/\{(\w+)\}/g, (match, paramName) => {
    return params[paramName] !== undefined ? String(params[paramName]) : match;
  });
}

// Set a user's locale preference
function setUserLocale(userId, locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return false;
  userLocales.set(userId, locale);
  return true;
}

// Get a user's locale (defaults to 'en')
function getUserLocale(userId) {
  return userLocales.get(userId) || DEFAULT_LOCALE;
}

// Helper: translate for a specific user
function tu(userId, key, params = {}) {
  return t(getUserLocale(userId), key, params);
}

// Get available locales for display
function getAvailableLocales() {
  return SUPPORTED_LOCALES.map(l => {
    const names = { en: 'English', es: 'Español', pt: 'Português', fr: 'Français' };
    const flags = { en: '🇬🇧', es: '🇪🇸', pt: '🇧🇷', fr: '🇫🇷' };
    return { code: l, name: names[l] || l, flag: flags[l] || '🏳️', loaded: locales.has(l) };
  });
}

module.exports = { init, t, tu, setUserLocale, getUserLocale, getAvailableLocales, SUPPORTED_LOCALES, DEFAULT_LOCALE };
