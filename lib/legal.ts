// The terms of use and privacy policy shown at /terms and /privacy, linked
// from the bot's welcome and the sign-in and sign-up pages. Draft wording,
// written in English only; the pages translate their headings and say so.
// When the operator becomes a company, change `legalOperator` and `legalUpdated`.
export const legalOperator='Jasurbek Shomurodov';
export const legalContact='dangerhoggish@gmail.com';
export const legalUpdated='2026-10-01';
export type LegalSection={heading:string;paragraphs:string[];items?:string[]};
export type LegalDocument={kind:'terms'|'privacy';sections:LegalSection[]};
export const legalPaths={terms:'/terms',privacy:'/privacy'} as const;

export const termsOfUse:LegalDocument={kind:'terms',sections:[
 {heading:'About these terms',paragraphs:[
  `Hoggish is a personal finance app on the web and in Telegram. It is operated by ${legalOperator} ("we", "us"). These terms apply when you create an account or use Hoggish in either place. By creating an account or pressing "I agree" in the Telegram bot, you accept them.`,
 ]},
 {heading:'Your account',paragraphs:[
  'You can create an account with an email address and password, with Google, or by sharing your phone number with our Telegram bot. You are responsible for keeping access to your email, Google account, phone number and Telegram account secure, and for everything done with your account.',
  'Give accurate details when you register. You must be old enough to agree to these terms where you live.',
 ]},
 {heading:'What Hoggish is, and what it is not',paragraphs:[
  'Hoggish helps you record and organize your own financial information: accounts, income, expenses, assets, loans, goals and plans. It does not hold, move or invest money, and it does not connect to your bank.',
  'Hoggish is not financial, investment, tax or legal advice. Forecasts, payoff plans, benchmarks, exchange rates and market prices are estimates for your information. They can be delayed, incomplete or wrong. Check important figures yourself and talk to a qualified professional before making financial decisions.',
 ]},
 {heading:'Your data',paragraphs:[
  'The records you enter belong to you. You give us permission to store and process them only to run Hoggish for you, as described in the privacy policy. You can download a backup of your data and delete your account at any time.',
 ]},
 {heading:'Acceptable use',paragraphs:['When you use Hoggish, do not:'],items:[
  'break the law or use Hoggish for fraud or money laundering;',
  'try to reach another person\'s account or data, or get around security limits;',
  'overload, disrupt or reverse engineer the service, or access it with automated tools beyond normal use;',
  'enter information about other people without the right to do so.',
 ]},
 {heading:'Availability and changes',paragraphs:[
  'We work to keep Hoggish running and your data safe, but we cannot promise it will always be available or free of errors. Features may change, be added or be removed.',
  'We may update these terms. When we make an important change, we will update the date at the top and tell you in the app or in Telegram. If you keep using Hoggish after a change, the new terms apply.',
 ]},
 {heading:'Ending your use',paragraphs:[
  'You can stop using Hoggish and delete your account at any time. We may suspend or close an account that breaks these terms or puts the service or other people at risk, and will tell you when we can.',
 ]},
 {heading:'Liability',paragraphs:[
  'Hoggish is provided "as is". To the extent the law allows, we are not liable for indirect or consequential losses, or for decisions you make based on information in the app. Nothing in these terms limits rights you have under the consumer law that applies to you.',
 ]},
 {heading:'Contact',paragraphs:[`Questions about these terms: ${legalContact}.`]},
]};

export const privacyPolicy:LegalDocument={kind:'privacy',sections:[
 {heading:'Who we are',paragraphs:[
  `Hoggish is operated by ${legalOperator}, who is responsible for your personal data. Contact: ${legalContact}.`,
 ]},
 {heading:'What we collect',paragraphs:['We collect only what Hoggish needs to work:'],items:[
  'Account details: your email address, or your phone number when you sign up in Telegram, and your sign-in method. Passwords are stored by our authentication provider in hashed form; we never see them.',
  'Telegram details, if you connect the bot: your Telegram user ID, chat ID and first name, and the messages you send to the bot.',
  'Profile and preferences: the name you choose, country, language, currencies, font and notification settings.',
  'Financial records you enter: accounts, balances, income, expenses, assets, loans, goals, plans, categories and notes, and imported bank statements.',
  'Technical data: sign-in sessions kept in cookies, and server logs of requests that our hosting provider keeps for a short time for security.',
 ]},
 {heading:'How we use it',paragraphs:['We use your data to:'],items:[
  'provide Hoggish: store your records, calculate totals and forecasts, and show them back to you;',
  'send the Telegram messages you have turned on, such as the morning digest, weekly summary and confirmations of saved actions;',
  'sign you in, keep your account secure and prevent abuse;',
  'answer you when you contact us.',
 ]},
 {heading:'What we do not do',paragraphs:[
  'We do not sell your data, show advertising, or use your financial records to profile you. We do not run analytics or tracking scripts in the app.',
 ]},
 {heading:'Services we use',paragraphs:['Your data is processed by these providers, only to run Hoggish:'],items:[
  'Supabase: database and authentication.',
  'Vercel: hosting of the app and its servers.',
  'Telegram: delivering bot messages, if you connect the bot.',
  'Google: sign-in, if you choose Sign in with Google.',
  'Cloudflare R2: encrypted backups of the database.',
  'Market and exchange-rate services (Twelve Data, Coinbase, Bitfinex, ExchangeRate-API): we send them only ticker symbols and currency codes, never your personal data.',
 ]},
 {heading:'How long we keep it',paragraphs:[
  'We keep your data while your account is open. Records you delete go to Recently deleted, where you can restore them. When you delete your account, your records are deleted; copies in encrypted backups are removed as those backups expire.',
 ]},
 {heading:'Your choices and rights',paragraphs:[
  'You can see and correct your data in the app, download a full backup in Settings, turn off Telegram messages or sign out of the bot at any time, and delete your account in Settings. Accounts created in Telegram can add an email in Settings to use deletion, or write to us.',
  `Depending on where you live, you may also have the right to ask what data we hold, to object to or restrict its use, or to complain to a data protection authority. Write to ${legalContact} and we will reply as soon as we can.`,
 ]},
 {heading:'Security',paragraphs:[
  'Data is encrypted in transit, each account can read only its own records, and backups are encrypted. No system is perfectly secure; if a breach affects your data, we will tell you.',
 ]},
 {heading:'Children',paragraphs:['Hoggish is not meant for children, and we do not knowingly collect their data.']},
 {heading:'Changes',paragraphs:['When we change this policy, we will update the date at the top and tell you in the app or in Telegram about important changes.']},
]};
