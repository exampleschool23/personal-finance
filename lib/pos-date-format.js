// Shared date formatting copied from zar-kebab-pos/src/lib/dateFormat.js.
function pad(value) {
  return String(value).padStart(2, '0')
}

export const RESTAURANT_TIME_ZONE = 'Asia/Tashkent'
export const RESTAURANT_UTC_OFFSET = '+05:00'
export const RESTAURANT_UTC_OFFSET_MINUTES = 5 * 60
const RESTAURANT_UTC_OFFSET_MS = RESTAURANT_UTC_OFFSET_MINUTES * 60 * 1000

export function parseDisplayDate(value, { dateOnly = false } = {}) {
  if (value === null || value === undefined || value === '') return null
  const raw = String(value)
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return parseInstantDate(`${raw}T00:00:00${RESTAURANT_UTC_OFFSET}`)
  }
  return parseInstantDate(value)
}

function hasExplicitTimeZone(value) {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value)
}

function normalizeInstantValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return raw
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00${RESTAURANT_UTC_OFFSET}`
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw) && !hasExplicitTimeZone(raw)) {
    return `${raw.replace(' ', 'T')}${RESTAURANT_UTC_OFFSET}`
  }
  return raw
}

export function parseInstantDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const date = new Date(normalizeInstantValue(value))
  return Number.isNaN(date.getTime()) ? null : date
}

export function elapsedMinutesSince(value, now = Date.now()) {
  const date = parseInstantDate(value)
  const nowDate = typeof now === 'number' ? new Date(now) : parseInstantDate(now)
  if (!date || !nowDate) return null
  return Math.max(0, Math.floor((nowDate.getTime() - date.getTime()) / 60000))
}

function resolveElapsedLabel(label, ...args) {
  return typeof label === 'function' ? label(...args) : label
}

export function formatElapsedSince(value, {
  now = Date.now(),
  lessThanMinute = '< 1 min',
  minutes = n => `${n} min`,
  hoursMinutes = (h, m) => `${h}h ${m}m`,
} = {}) {
  const diff = elapsedMinutesSince(value, now)
  if (diff === null) return null
  if (diff < 1) return resolveElapsedLabel(lessThanMinute, diff)
  if (diff < 60) return resolveElapsedLabel(minutes, diff)
  return resolveElapsedLabel(hoursMinutes, Math.floor(diff / 60), diff % 60)
}

export function formatDateOnly(value, fallback = '') {
  const parts = getRestaurantDateParts(value, { dateOnly: true })
  if (!parts) return fallback
  return `${pad(parts.day)}.${pad(parts.month)}.${parts.year}`
}

const LONG_MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
}

const MONTH_TITLES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
}

export function normalizeDateLang(lang = 'en') {
  const normalized = String(lang || 'en').toLowerCase().split(/[-_]/)[0]
  return LONG_MONTHS[normalized] ? normalized : 'en'
}

export function formatLongDate(value, lang = 'en', fallback = '', { includeYear = true } = {}) {
  const parts = getRestaurantDateParts(value, { dateOnly: true })
  if (!parts) return fallback
  const months = LONG_MONTHS[normalizeDateLang(lang)]
  return includeYear
    ? `${parts.day} ${months[parts.month - 1]} ${parts.year}`
    : `${parts.day} ${months[parts.month - 1]}`
}

export function formatMonthYear(value, lang = 'en', fallback = '') {
  const raw = String(value || '')
  const normalized = /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : raw
  const parts = getRestaurantDateParts(normalized, { dateOnly: true })
  if (!parts) return fallback
  const months = MONTH_TITLES[normalizeDateLang(lang)]
  return `${months[parts.month - 1]} ${parts.year}`
}

export function formatTime(value, fallback = '') {
  const parts = getRestaurantDateParts(value)
  if (!parts) return fallback
  return `${pad(parts.hour)}:${pad(parts.minute)}`
}

export function formatDateTime(value, fallback = '') {
  const date = parseDisplayDate(value)
  if (!date) return fallback
  return `${formatDateOnly(date)} ${formatTime(date)}`
}

export function formatLongDateTime(value, lang = 'en', fallback = '', { includeYear = true } = {}) {
  const date = parseDisplayDate(value)
  if (!date) return fallback
  return `${formatLongDate(date, lang, fallback, { includeYear })} ${formatTime(date)}`
}

function getRestaurantDateParts(value, options) {
  const date = parseDisplayDate(value, options)
  if (!date) return null
  const restaurantDate = new Date(date.getTime() + RESTAURANT_UTC_OFFSET_MS)
  return {
    year: restaurantDate.getUTCFullYear(),
    month: restaurantDate.getUTCMonth() + 1,
    day: restaurantDate.getUTCDate(),
    hour: restaurantDate.getUTCHours(),
    minute: restaurantDate.getUTCMinutes(),
  }
}
