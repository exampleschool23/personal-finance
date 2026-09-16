import catalogue from './currencies.json' with { type: 'json' };
/** @param {string} code */
export const currencyDigits = (code) => catalogue.find(c => c.code === code)?.digits ?? 2;
