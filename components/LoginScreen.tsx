import React from 'react';
import { t, Language } from '../utils/i18n';
import { ADMIN_EMAIL } from '../hooks/useAuthSession';
import type { AppText } from '../hooks/useAppText';
import type { AlertDialogState } from '../types';
import { FORM_FIELD_THEME } from '../utils/formFieldClasses';
import AlertDialog from './AlertDialog';

interface Props {
  language: Language;
  loginEmail: string;
  setLoginEmail: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  appText: AppText;
  alertDialog: AlertDialogState;
  onCloseAlert: () => void;
}

const LoginScreen: React.FC<Props> = ({
  language,
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  onSubmit,
  appText,
  alertDialog,
  onCloseAlert,
}) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
      <div className="p-8">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-3xl font-bold shadow-lg">
            T
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-800">{t(language).login.title}</h1>
          <p className="mt-2 text-slate-500 text-sm">{t(language).login.subtitle}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700">{t(language).login.email}</label>
            <input
              type="email"
              required
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
              className={`mt-1 w-full border border-slate-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 ${FORM_FIELD_THEME}`}
              placeholder="name@example.com"
            />
          </div>
          {loginEmail === ADMIN_EMAIL && (
            <div>
              <label className="block text-sm font-medium text-slate-700">{t(language).login.password}</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className={`mt-1 w-full border border-slate-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 ${FORM_FIELD_THEME}`}
                placeholder={appText.loginPasswordPlaceholder}
              />
            </div>
          )}
          <button
            type="submit"
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-colors"
          >
            {t(language).login.login}
          </button>
        </form>
        <div className="mt-8 space-y-4">
          <div className="p-4 bg-blue-50 border-2 border-dashed border-blue-400 rounded-xl text-center shadow-sm">
            <p className="text-sm font-bold text-blue-900 flex flex-col items-center gap-1">
              <span className="flex items-center gap-1 text-blue-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                {t(language).login.privacy}
              </span>
              <span>{t(language).login.privacyDesc}</span>
            </p>
          </div>
          <div className="p-4 bg-red-50 border-2 border-dashed border-red-400 rounded-xl text-center shadow-sm">
            <p className="text-sm font-bold text-red-900 flex flex-col items-center gap-1">
              <span className="flex items-center gap-1 text-red-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {t(language).login.riskDisclaimer}
              </span>
              <span className="text-xs text-red-800 mt-1">{t(language).login.riskDisclaimerDesc}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
    <AlertDialog dialog={alertDialog} language={language} onClose={onCloseAlert} />
  </div>
);

export default LoginScreen;
