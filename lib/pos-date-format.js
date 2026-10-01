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

const numberedMonths = suffix => Array.from({ length: 12 }, (_, index) => `${index + 1}${suffix}`)
const capitalized = names => names.map(name => name.charAt(0).toUpperCase() + name.slice(1))
const SPANISH_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const PORTUGUESE_MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const FRENCH_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const HINDI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']
const URDU_MONTHS = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر']
const BENGALI_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']
const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const VIETNAMESE_MONTHS = Array.from({ length: 12 }, (_, index) => `tháng ${index + 1}`)
const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const GERMAN_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const ITALIAN_MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const TURKISH_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const INDONESIAN_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const MALAY_MONTHS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember']
const POLISH_MONTHS_GENITIVE = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
const POLISH_MONTH_TITLES = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']
const UKRAINIAN_MONTHS_GENITIVE = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']
const UKRAINIAN_MONTH_TITLES = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень']
const DUTCH_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const CZECH_MONTHS_GENITIVE = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince']
const CZECH_MONTH_TITLES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec']
const ROMANIAN_MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
const PERSIAN_MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر']
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const FILIPINO_MONTHS = ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre']
const SWAHILI_MONTHS = ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba']

const LONG_MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  es: SPANISH_MONTHS,
  pt: PORTUGUESE_MONTHS,
  fr: FRENCH_MONTHS,
  hi: HINDI_MONTHS,
  ur: URDU_MONTHS,
  bn: BENGALI_MONTHS,
  th: THAI_MONTHS,
  vi: VIETNAMESE_MONTHS,
  ar: ARABIC_MONTHS,
  zh: numberedMonths('月'),
  ja: numberedMonths('月'),
  ko: numberedMonths('월'),
  de: GERMAN_MONTHS,
  it: ITALIAN_MONTHS,
  tr: TURKISH_MONTHS,
  id: INDONESIAN_MONTHS,
  ms: MALAY_MONTHS,
  pl: POLISH_MONTHS_GENITIVE,
  uk: UKRAINIAN_MONTHS_GENITIVE,
  nl: DUTCH_MONTHS,
  cs: CZECH_MONTHS_GENITIVE,
  ro: ROMANIAN_MONTHS,
  fa: PERSIAN_MONTHS,
  he: HEBREW_MONTHS,
  fil: FILIPINO_MONTHS,
  sw: SWAHILI_MONTHS,
}

const MONTH_TITLES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  es: capitalized(SPANISH_MONTHS),
  pt: capitalized(PORTUGUESE_MONTHS),
  fr: capitalized(FRENCH_MONTHS),
  hi: HINDI_MONTHS,
  ur: URDU_MONTHS,
  bn: BENGALI_MONTHS,
  th: THAI_MONTHS,
  vi: capitalized(VIETNAMESE_MONTHS),
  ar: ARABIC_MONTHS,
  zh: numberedMonths('月'),
  ja: numberedMonths('月'),
  ko: numberedMonths('월'),
  de: GERMAN_MONTHS,
  it: capitalized(ITALIAN_MONTHS),
  tr: TURKISH_MONTHS,
  id: INDONESIAN_MONTHS,
  ms: MALAY_MONTHS,
  pl: POLISH_MONTH_TITLES,
  uk: UKRAINIAN_MONTH_TITLES,
  nl: capitalized(DUTCH_MONTHS),
  cs: CZECH_MONTH_TITLES,
  ro: capitalized(ROMANIAN_MONTHS),
  fa: PERSIAN_MONTHS,
  he: HEBREW_MONTHS,
  fil: FILIPINO_MONTHS,
  sw: SWAHILI_MONTHS,
}

// A date reads day, month, year in most languages; East Asian languages run year first and Spanish and Portuguese join the parts with "de".
const spanishDate = (day, month, year) => year === null ? `${day} de ${month}` : `${day} de ${month} de ${year}`
const chineseDate = (day, month, year) => year === null ? `${month}${day}日` : `${year}年${month}${day}日`
const dottedDate = (day, month, year) => year === null ? `${day}. ${month}` : `${day}. ${month} ${year}`
const DATE_PATTERNS = {
  es: spanishDate,
  pt: spanishDate,
  zh: chineseDate,
  ja: chineseDate,
  ko: (day, month, year) => year === null ? `${month} ${day}일` : `${year}년 ${month} ${day}일`,
  vi: (day, month, year) => year === null ? `${day} ${month}` : `${day} ${month} năm ${year}`,
  de: dottedDate,
  cs: dottedDate,
  he: (day, month, year) => year === null ? `${day} ב${month}` : `${day} ב${month} ${year}`,
}
const defaultDate = (day, month, year) => year === null ? `${day} ${month}` : `${day} ${month} ${year}`
const spanishTitle = (month, year) => `${month} de ${year}`
const TITLE_PATTERNS = {
  es: spanishTitle,
  pt: spanishTitle,
  zh: (month, year) => `${year}年${month}`,
  ja: (month, year) => `${year}年${month}`,
  ko: (month, year) => `${year}년 ${month}`,
  vi: (month, year) => `${month} năm ${year}`,
}

const WEEKDAYS = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  es: ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'],
  pt: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
  ar: ['اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت', 'أحد'],
  zh: ['一', '二', '三', '四', '五', '六', '日'],
  ja: ['月', '火', '水', '木', '金', '土', '日'],
  ko: ['월', '화', '수', '목', '금', '토', '일'],
  fr: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
  hi: ['सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि', 'रवि'],
  ur: ['پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ', 'اتوار'],
  bn: ['সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি', 'রবি'],
  th: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'],
  vi: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  it: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
  tr: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
  id: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
  ms: ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd'],
  pl: ['Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'],
  uk: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
  nl: ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'],
  cs: ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'],
  ro: ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'],
  fa: ['د', 'س', 'چ', 'پ', 'ج', 'ش', 'ی'],
  he: ['ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳', 'א׳'],
  fil: ['Lun', 'Mar', 'Miy', 'Huw', 'Biy', 'Sab', 'Lin'],
  sw: ['Jtt', 'Jnn', 'Jtn', 'Alh', 'Iju', 'Jms', 'Jpl'],
}

export function normalizeDateLang(lang = 'en') {
  const normalized = String(lang || 'en').toLowerCase().split(/[-_]/)[0]
  return LONG_MONTHS[normalized] ? normalized : 'en'
}

/** Monday-first weekday labels for the calendar grid. */
export function weekdayLabels(lang = 'en') {
  return WEEKDAYS[normalizeDateLang(lang)]
}

export function formatLongDate(value, lang = 'en', fallback = '', { includeYear = true } = {}) {
  const parts = getRestaurantDateParts(value, { dateOnly: true })
  if (!parts) return fallback
  const normalized = normalizeDateLang(lang)
  const month = LONG_MONTHS[normalized][parts.month - 1]
  return (DATE_PATTERNS[normalized] ?? defaultDate)(parts.day, month, includeYear ? parts.year : null)
}

export function formatMonthYear(value, lang = 'en', fallback = '') {
  const raw = String(value || '')
  const normalized = /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : raw
  const parts = getRestaurantDateParts(normalized, { dateOnly: true })
  if (!parts) return fallback
  const language = normalizeDateLang(lang)
  const month = MONTH_TITLES[language][parts.month - 1]
  return (TITLE_PATTERNS[language] ?? ((title, year) => `${title} ${year}`))(month, parts.year)
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
