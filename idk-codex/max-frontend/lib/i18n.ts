'use client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../public/locales/en/common.json';
import pidgin from '../public/locales/pidgin/common.json';
import ha from '../public/locales/ha/common.json';
import yo from '../public/locales/yo/common.json';
import fr from '../public/locales/fr/common.json';

const savedLang = typeof window !== 'undefined' ? localStorage.getItem('max_language') || 'en' : 'en';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: savedLang,
    fallbackLng: 'en',
    resources: {
      en: { common: en },
      pidgin: { common: pidgin },
      ha: { common: ha },
      yo: { common: yo },
      fr: { common: fr }
    },
    interpolation: { escapeValue: false }
  });
}

export default i18n;
