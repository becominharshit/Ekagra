import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import academicsEn from '@/locales/en/academics.json'
import billingEn from '@/locales/en/billing.json'
import codingEn from '@/locales/en/coding.json'
import commonEn from '@/locales/en/common.json'
import focusEn from '@/locales/en/focus.json'

export const I18N_NAMESPACES = ['common', 'academics', 'focus', 'coding', 'billing'] as const

export const resources = {
  en: {
    common: commonEn,
    academics: academicsEn,
    focus: focusEn,
    coding: codingEn,
    billing: billingEn,
  },
} as const

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: [...I18N_NAMESPACES],
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  })
}

export { i18n }
