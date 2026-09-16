import en from './locales/en.json';
import ru from './locales/ru.json';
import uz from './locales/uz.json';

export type Language = 'en' | 'ru' | 'uz';
export const locales = { en: 'en-US', ru: 'ru-RU', uz: 'uz-UZ' } as const;
export const dictionaries: Record<Language, Record<string, string>> = { en, ru, uz };
export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'ru' || value === 'uz';
}
export function translate(language: Language, key: string, params: Record<string, string | number> = {}) {
  const text = Object.hasOwn(dictionaries[language], key) ? dictionaries[language][key] : key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => params[name] === undefined ? match : String(params[name]));
}
