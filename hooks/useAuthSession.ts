import { useState, useEffect, useCallback } from 'react';
import { ADMIN_EMAIL, SYSTEM_ACCESS_CODE, GLOBAL_AUTHORIZED_USERS } from '../config';
import { openMailTo } from '../utils/openMailTo';
import { getLanguage, setLanguage as saveLanguage, Language } from '../utils/i18n';
import { useAppText, AppText } from './useAppText';
import {
  userChoseGuestLoginRef,
  resolveGeneralUserLoginGuestState,
  afterGeneralUserLogin,
} from './useSubscription';
import type { AlertDialogState } from '../types';

export { ADMIN_EMAIL };

export interface AuthSession {
  isAuthenticated: boolean;
  isGuest: boolean;
  setIsGuest: (v: boolean) => void;
  currentUser: string;
  loginEmail: string;
  setLoginEmail: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  language: Language;
  handleLanguageChange: (lang: Language) => void;
  appText: AppText;
  isChinese: boolean;
  alertDialog: AlertDialogState;
  showAlert: (message: string, title?: string, type?: AlertDialogState['type']) => void;
  closeAlert: () => void;
  handleLogin: (e: React.FormEvent) => void;
  handleLogout: () => void;
  handleContactAdmin: () => void;
  userPrefix: string | undefined;
}

export function useAuthSession(): AuthSession {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [language, setLanguage] = useState<Language>(getLanguage());
  const [alertDialog, setAlertDialog] = useState<AlertDialogState>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  const appText = useAppText(language, currentUser);
  const isChinese = language === 'zh-TW' || language === 'zh-CN';

  const showAlert = useCallback(
    (message: string, title = appText.alertTitleInfo, type: AlertDialogState['type'] = 'info') => {
      setAlertDialog({ isOpen: true, title, message, type });
    },
    [appText.alertTitleInfo]
  );

  const closeAlert = useCallback(() => {
    setAlertDialog((prev: AlertDialogState) => ({ ...prev, isOpen: false }));
  }, []);

  useEffect(() => {
    const lastUser = localStorage.getItem('tf_last_user');
    const isAuth = localStorage.getItem('tf_is_auth');
    const guestStatus = localStorage.getItem('tf_is_guest');
    setLanguage(getLanguage());
    if (isAuth === 'true' && lastUser) {
      setCurrentUser(lastUser);
      setIsGuest(guestStatus === 'true');
      setIsAuthenticated(true);
    }
  }, []);

  const loginSuccess = useCallback((user: string, isGuestUser: boolean) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setIsGuest(isGuestUser);
    localStorage.setItem('tf_is_auth', 'true');
    localStorage.setItem('tf_last_user', user);
    localStorage.setItem('tf_is_guest', isGuestUser ? 'true' : 'false');
  }, []);

  const handleLogin = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const email = loginEmail.trim();
      const password = loginPassword.trim();
      if (!email) return showAlert(appText.enterEmail, appText.loginErrorTitle, 'error');
      if (email === ADMIN_EMAIL) {
        if (password === SYSTEM_ACCESS_CODE) {
          loginSuccess(email, false);
          showAlert(appText.adminWelcome, appText.loginSuccessTitle, 'success');
        } else showAlert(appText.adminPasswordWrong, appText.loginFailedTitle, 'error');
        return;
      }
      if (GLOBAL_AUTHORIZED_USERS.includes(email)) {
        loginSuccess(email, false);
        showAlert(appText.memberModeLoginSuccess, appText.loginSuccessTitle, 'success');
        return;
      }

      const startAsGuest = resolveGeneralUserLoginGuestState();
      if (startAsGuest) {
        userChoseGuestLoginRef.current = true;
        loginSuccess(email, true);
        showAlert(appText.guestModeLoginSuccess, appText.loginSuccessTitle, 'info');
      } else {
        userChoseGuestLoginRef.current = false;
        loginSuccess(email, false);
        showAlert(appText.memberModeLoginSuccess, appText.loginSuccessTitle, 'success');
      }
      afterGeneralUserLogin(email, setIsGuest);
    },
    [loginEmail, loginPassword, appText, loginSuccess, showAlert]
  );

  const handleLogout = useCallback(() => {
    userChoseGuestLoginRef.current = false;
    setIsAuthenticated(false);
    setIsGuest(false);
    setCurrentUser('');
    setLoginEmail('');
    setLoginPassword('');
    localStorage.removeItem('tf_is_auth');
    localStorage.removeItem('tf_last_user');
    localStorage.removeItem('tf_is_guest');
  }, []);

  const handleContactAdmin = useCallback(() => {
    openMailTo(ADMIN_EMAIL, appText.contactSubject, appText.contactBody);
  }, [appText.contactSubject, appText.contactBody]);

  const handleLanguageChange = useCallback((lang: Language) => {
    setLanguage(lang);
    saveLanguage(lang);
  }, []);

  const userPrefix = isAuthenticated && currentUser ? `tf_${currentUser}` : undefined;

  return {
    isAuthenticated,
    isGuest,
    setIsGuest,
    currentUser,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    language,
    handleLanguageChange,
    appText,
    isChinese,
    alertDialog,
    showAlert,
    closeAlert,
    handleLogin,
    handleLogout,
    handleContactAdmin,
    userPrefix,
  };
}
