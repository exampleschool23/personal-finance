/** The languages the app offers, in the order they are listed. `short` labels the compact selector. */
export const languageCatalogue = [
  { code: 'en', native: 'English', locale: 'en-US', dir: 'ltr', short: 'EN' },
  { code: 'es', native: 'Español', locale: 'es-ES', dir: 'ltr', short: 'ES' },
  { code: 'es-MX', native: 'Español (México)', locale: 'es-MX', dir: 'ltr', short: 'MX' },
  { code: 'pt', native: 'Português', locale: 'pt-BR', dir: 'ltr', short: 'PT' },
  { code: 'fr', native: 'Français', locale: 'fr-FR', dir: 'ltr', short: 'FR' },
  { code: 'ru', native: 'Русский', locale: 'ru-RU', dir: 'ltr', short: 'RU' },
  { code: 'ar', native: 'العربية', locale: 'ar-AE', dir: 'rtl', short: 'AR' },
  { code: 'ur', native: 'اردو', locale: 'ur-PK', dir: 'rtl', short: 'UR' },
  { code: 'hi', native: 'हिन्दी', locale: 'hi-IN', dir: 'ltr', short: 'HI' },
  // Bengali formats numbers with Bengali digits by default; Latin digits keep amounts and inputs consistent.
  { code: 'bn', native: 'বাংলা', locale: 'bn-BD-u-nu-latn', dir: 'ltr', short: 'BN' },
  { code: 'zh', native: '简体中文', locale: 'zh-CN', dir: 'ltr', short: 'ZH' },
  { code: 'ja', native: '日本語', locale: 'ja-JP', dir: 'ltr', short: 'JA' },
  { code: 'ko', native: '한국어', locale: 'ko-KR', dir: 'ltr', short: 'KO' },
  { code: 'th', native: 'ไทย', locale: 'th-TH-u-nu-latn-ca-gregory', dir: 'ltr', short: 'TH' },
  { code: 'vi', native: 'Tiếng Việt', locale: 'vi-VN', dir: 'ltr', short: 'VI' },
  { code: 'uz', native: 'O‘zbekcha', locale: 'uz-UZ', dir: 'ltr', short: 'UZ' },
  { code: 'de', native: 'Deutsch', locale: 'de-DE', dir: 'ltr', short: 'DE' },
  { code: 'it', native: 'Italiano', locale: 'it-IT', dir: 'ltr', short: 'IT' },
  { code: 'tr', native: 'Türkçe', locale: 'tr-TR', dir: 'ltr', short: 'TR' },
  { code: 'id', native: 'Bahasa Indonesia', locale: 'id-ID', dir: 'ltr', short: 'ID' },
  { code: 'ms', native: 'Bahasa Melayu', locale: 'ms-MY', dir: 'ltr', short: 'MS' },
  { code: 'pl', native: 'Polski', locale: 'pl-PL', dir: 'ltr', short: 'PL' },
  { code: 'uk', native: 'Українська', locale: 'uk-UA', dir: 'ltr', short: 'UK' },
  { code: 'nl', native: 'Nederlands', locale: 'nl-NL', dir: 'ltr', short: 'NL' },
  { code: 'cs', native: 'Čeština', locale: 'cs-CZ', dir: 'ltr', short: 'CS' },
  { code: 'ro', native: 'Română', locale: 'ro-RO', dir: 'ltr', short: 'RO' },
  // Persian formats numbers with Persian digits by default; Latin digits keep amounts and inputs consistent.
  { code: 'fa', native: 'فارسی', locale: 'fa-IR-u-nu-latn', dir: 'rtl', short: 'FA' },
  { code: 'he', native: 'עברית', locale: 'he-IL', dir: 'rtl', short: 'HE' },
  { code: 'fil', native: 'Filipino', locale: 'fil-PH', dir: 'ltr', short: 'FIL' },
  { code: 'sw', native: 'Kiswahili', locale: 'sw-KE', dir: 'ltr', short: 'SW' },
] as const;
export type Language = (typeof languageCatalogue)[number]['code'];
export const languageCodes = languageCatalogue.map(language => language.code) as [Language, ...Language[]];
/** Scripts the bundled PDF font cannot draw; reports in these languages are written in English. */
export const pdfUnsupportedLanguages: readonly Language[] = ['ar', 'ur', 'hi', 'bn', 'zh', 'ja', 'ko', 'th', 'fa', 'he'];
