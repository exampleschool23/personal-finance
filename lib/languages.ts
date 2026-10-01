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
] as const;
export type Language = (typeof languageCatalogue)[number]['code'];
export const languageCodes = languageCatalogue.map(language => language.code) as [Language, ...Language[]];
/** Scripts the bundled PDF font cannot draw; reports in these languages are written in English. */
export const pdfUnsupportedLanguages: readonly Language[] = ['ar', 'ur', 'hi', 'bn', 'zh', 'ja', 'ko', 'th'];
