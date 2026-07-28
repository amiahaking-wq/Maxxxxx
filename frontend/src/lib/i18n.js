/**
 * i18n — Multi-language UI support (Feature #18)
 *
 * Simple client-side i18n with localStorage persistence.
 * Supports: English, French, Spanish, Arabic, Chinese, Hausa, Yoruba, Igbo
 *
 * Usage:
 *   import { t, setLang, getLang } from '../lib/i18n';
 *   <button>{t('send')}</button>
 */

const TRANSLATIONS = {
  en: {
    send: 'Send',
    stop: 'Stop',
    thinking: 'Thinking...',
    newChat: 'New Chat',
    settings: 'Settings',
    profile: 'Profile',
    agent: 'Agent',
    permissions: 'Permissions',
    memory: 'Memory',
    knowledge: 'Knowledge',
    connectors: 'Connectors',
    about: 'About',
    messageMax: 'Message MAX...',
    listening: 'Listening...',
    welcome: 'Welcome to MAX',
    welcomeSubtitle: 'Your autonomous AI agent',
    startSuggestion: 'Try asking me to build something',
    fileAttached: 'File attached',
    uploadFailed: 'Upload failed',
    model: 'Model',
    linked: 'Linked',
    unlinkTelegram: 'Unlink Telegram',
    linkTelegram: 'Link Telegram Account',
    saveProfile: 'Save Profile',
    addDocument: 'Add Document',
    addToKnowledge: 'Add to Knowledge Base',
    addCredentials: 'Add credentials',
    updateCredentials: 'Update credentials',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete'
  },
  fr: {
    send: 'Envoyer',
    stop: 'Arrêter',
    thinking: 'Réflexion...',
    newChat: 'Nouvelle conversation',
    settings: 'Paramètres',
    profile: 'Profil',
    agent: 'Agent',
    permissions: 'Autorisations',
    memory: 'Mémoire',
    knowledge: 'Connaissances',
    connectors: 'Connecteurs',
    about: 'À propos',
    messageMax: 'Envoyer un message à MAX...',
    listening: 'Écoute...',
    welcome: 'Bienvenue sur MAX',
    welcomeSubtitle: 'Votre agent IA autonome',
    startSuggestion: 'Demandez-moi de construire quelque chose',
    fileAttached: 'Fichier joint',
    uploadFailed: 'Échec du téléversement',
    model: 'Modèle',
    linked: 'Connecté',
    unlinkTelegram: 'Déconnecter Telegram',
    linkTelegram: 'Connecter un compte Telegram',
    saveProfile: 'Enregistrer le profil',
    addDocument: 'Ajouter un document',
    addToKnowledge: 'Ajouter à la base de connaissances',
    addCredentials: 'Ajouter des identifiants',
    updateCredentials: 'Mettre à jour les identifiants',
    cancel: 'Annuler',
    save: 'Enregistrer',
    delete: 'Supprimer'
  },
  es: {
    send: 'Enviar',
    stop: 'Detener',
    thinking: 'Pensando...',
    newChat: 'Nuevo chat',
    settings: 'Configuración',
    profile: 'Perfil',
    agent: 'Agente',
    permissions: 'Permisos',
    memory: 'Memoria',
    knowledge: 'Conocimiento',
    connectors: 'Conectores',
    about: 'Acerca de',
    messageMax: 'Mensaje a MAX...',
    listening: 'Escuchando...',
    welcome: 'Bienvenido a MAX',
    welcomeSubtitle: 'Tu agente de IA autónomo',
    startSuggestion: 'Pídeme que construya algo',
    fileAttached: 'Archivo adjunto',
    uploadFailed: 'Error al subir',
    model: 'Modelo',
    linked: 'Vinculado',
    unlinkTelegram: 'Desvincular Telegram',
    linkTelegram: 'Vincular cuenta de Telegram',
    saveProfile: 'Guardar perfil',
    addDocument: 'Añadir documento',
    addToKnowledge: 'Añadir a la base de conocimiento',
    addCredentials: 'Añadir credenciales',
    updateCredentials: 'Actualizar credenciales',
    cancel: 'Cancelar',
    save: 'Guardar',
    delete: 'Eliminar'
  },
  ar: {
    send: 'إرسال',
    stop: 'إيقاف',
    thinking: 'يفكر...',
    newChat: 'محادثة جديدة',
    settings: 'الإعدادات',
    profile: 'الملف الشخصي',
    agent: 'الوكيل',
    permissions: 'الأذونات',
    memory: 'الذاكرة',
    knowledge: 'المعرفة',
    connectors: 'الموصلات',
    about: 'حول',
    messageMax: 'رسالة إلى MAX...',
    listening: 'يستمع...',
    welcome: 'مرحبا بك في MAX',
    welcomeSubtitle: 'وكيل الذكاء الاصطناعي الخاص بك',
    startSuggestion: 'اطلب مني بناء شيء ما',
    fileAttached: 'تم إرفاق الملف',
    uploadFailed: 'فشل الرفع',
    model: 'النموذج',
    linked: 'مرتبط',
    unlinkTelegram: 'إلغاء ربط Telegram',
    linkTelegram: 'ربط حساب Telegram',
    saveProfile: 'حفظ الملف الشخصي',
    addDocument: 'إضافة مستند',
    addToKnowledge: 'إضافة إلى قاعدة المعرفة',
    addCredentials: 'إضافة بيانات اعتماد',
    updateCredentials: 'تحديث بيانات الاعتماد',
    cancel: 'إلغاء',
    save: 'حفظ',
    delete: 'حذف'
  },
  zh: {
    send: '发送',
    stop: '停止',
    thinking: '思考中...',
    newChat: '新对话',
    settings: '设置',
    profile: '个人资料',
    agent: '代理',
    permissions: '权限',
    memory: '记忆',
    knowledge: '知识',
    connectors: '连接器',
    about: '关于',
    messageMax: '向 MAX 发送消息...',
    listening: '聆听中...',
    welcome: '欢迎使用 MAX',
    welcomeSubtitle: '您的自主 AI 代理',
    startSuggestion: '试着让我构建一些东西',
    fileAttached: '文件已附加',
    uploadFailed: '上传失败',
    model: '模型',
    linked: '已链接',
    unlinkTelegram: '取消链接 Telegram',
    linkTelegram: '链接 Telegram 账户',
    saveProfile: '保存个人资料',
    addDocument: '添加文档',
    addToKnowledge: '添加到知识库',
    addCredentials: '添加凭据',
    updateCredentials: '更新凭据',
    cancel: '取消',
    save: '保存',
    delete: '删除'
  },
  ha: {
    send: 'Aika',
    stop: 'Tsaya',
    thinking: 'Yana tunani...',
    newChat: 'Sabon hira',
    settings: 'Saituna',
    profile: 'Bayanin',
    agent: 'Wakili',
    permissions: 'Izini',
    memory: 'Tunani',
    knowledge: 'Ilimi',
    connectors: 'Mahadi',
    about: 'Game da',
    messageMax: 'Saka saƙo ga MAX...',
    listening: 'Yana sauraro...',
    welcome: 'Barka da zuwa MAX',
    welcomeSubtitle: 'Wakilin AI ɗinku mai zaman kansa',
    startSuggestion: 'Nemi ni in gina wani abu',
    fileAttached: 'An makala fayil ɗin',
    uploadFailed: 'Aikawa ya gaza',
    model: 'Samfurin',
    linked: 'An danganta',
    unlinkTelegram: 'Cire dangantaka da Telegram',
    linkTelegram: 'Danganta asusun Telegram',
    saveProfile: 'Ajiye bayanin',
    addDocument: 'Ƙara takarda',
    addToKnowledge: 'Ƙara zuwa ilimin',
    addCredentials: 'Ƙara takardun shaida',
    updateCredentials: 'Sabunta takardun shaida',
    cancel: 'Soke',
    save: 'Ajiye',
    delete: 'Goge'
  }
};

const DEFAULT_LANG = 'en';

export function getLang() {
  return localStorage.getItem('max_lang') || DEFAULT_LANG;
}

export function setLang(lang) {
  if (TRANSLATIONS[lang]) {
    localStorage.setItem('max_lang', lang);
    // Trigger a re-render by dispatching a custom event
    window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
    return true;
  }
  return false;
}

export function t(key, fallback) {
  const lang = getLang();
  const translations = TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANG];
  return translations[key] || TRANSLATIONS[DEFAULT_LANG][key] || fallback || key;
}

export function getAvailableLanguages() {
  return [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'es', name: 'Español' },
    { code: 'ar', name: 'العربية' },
    { code: 'zh', name: '中文' },
    { code: 'ha', name: 'Hausa' }
  ];
}

export default { t, getLang, setLang, getAvailableLanguages };
