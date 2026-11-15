import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ko from './locales/ko/translation.json'
import en from './locales/en/translation.json'

export const supportedLanguages = ['ko', 'en'] as const
export type AppLanguage = (typeof supportedLanguages)[number]

const storedLanguage = window.localStorage.getItem('sanbool24-language')
const browserLanguage = window.navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ko'
const initialLanguage: AppLanguage = supportedLanguages.includes(storedLanguage as AppLanguage)
  ? storedLanguage as AppLanguage
  : browserLanguage

void i18n.use(initReactI18next).init({
  resources: { ko: { translation: ko }, en: { translation: en } },
  lng: initialLanguage,
  fallbackLng: 'ko',
  supportedLngs: supportedLanguages,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
})

function syncDocumentLanguage(language: string) {
  document.documentElement.lang = language
  window.localStorage.setItem('sanbool24-language', language)
}

syncDocumentLanguage(initialLanguage)
i18n.on('languageChanged', syncDocumentLanguage)

export function localeFor(language = i18n.resolvedLanguage) {
  return language === 'en' ? 'en-US' : 'ko-KR'
}

export default i18n
