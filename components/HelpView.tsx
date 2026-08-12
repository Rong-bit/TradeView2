import React, { useRef, useState } from 'react';
import { t, translate } from '../utils/i18n';
import { useUI } from '../contexts/UIContext';
import { ADMIN_EMAIL, PRIVACY_POLICY_URL, TERMS_OF_USE_EULA_URL } from '../config';
import { openExternalUrl } from '../utils/openExternalUrl';
import { openMailTo } from '../utils/openMailTo';
import { MODAL_CANCEL_BUTTON } from '../utils/formFieldClasses';
import { downloadDocumentationPdf, removeHtml2PdfOverlays } from '../utils/downloadDocumentationPdf';
import DocumentationContent from './DocumentationContent';

interface Props {
  onExport: () => void;
  onImport: (file: File) => void;
  currentUser: string;
  onOpenSubscription?: () => void;
  onDeleteAccount?: () => void;
  onContactAdmin?: () => void;
}

const HelpView: React.FC<Props> = ({
  onExport,
  onImport,
  currentUser,
  onOpenSubscription,
  onDeleteAccount,
  onContactAdmin,
}) => {
  const { language, showAlert } = useUI();
  const translations = t(language);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentationRef = useRef<HTMLDivElement>(null);

  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingImportFile(file);
      e.target.value = '';
    }
  };

  const confirmImport = () => {
    if (pendingImportFile) {
      onImport(pendingImportFile);
      setPendingImportFile(null);
    }
  };

  const cancelImport = () => {
    setPendingImportFile(null);
  };

  const content = translations.help.documentationContent;

  const handleDownloadPdf = async () => {
    const el = documentationRef.current;
    if (!el || pdfLoading) return;
    setPdfLoading(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      await downloadDocumentationPdf(
        content,
        `TradeView_Manual_${date}.pdf`,
        translations.help.pdfShareTitle,
        language,
        el
      );
    } catch {
      showAlert(translations.help.pdfDownloadFailed, translations.help.documentation, 'error');
    } finally {
      removeHtml2PdfOverlays();
      setPdfLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="app-section-card p-6 border-l-4 border-indigo-500">
        <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 1.79 4 4 4h9v-9h-9v-5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7V4h16v3M9 21v-9h6v9" />
          </svg>
          {translations.help.dataManagement}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-50 p-4 rounded border border-slate-200">
            <h4 className="font-bold text-slate-700 mb-2">{translations.help.export}</h4>
            <p className="text-sm text-slate-500 mb-4">{translations.help.exportDesc}</p>
            <button
              type="button"
              onClick={onExport}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition shadow flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              {translations.help.downloadBackup}
            </button>
          </div>

          <div className="bg-slate-50 p-4 rounded border border-slate-200">
            <h4 className="font-bold text-slate-700 mb-2">{translations.help.import}</h4>
            <p className="text-sm text-red-500 mb-4">{translations.help.importWarning}</p>
            <div className="flex gap-2">
              <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={handleFileChange} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold py-2 px-4 rounded border border-slate-300 transition shadow-sm flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {translations.help.uploadBackup}
              </button>
            </div>
          </div>
        </div>
      </div>

      {onOpenSubscription && (
        <div className="app-section-card p-6 border-l-4 border-amber-500">
          <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            {translations.help.subscription}
          </h3>
          <div className="text-sm text-slate-700 leading-relaxed bg-amber-50 dark:bg-amber-900/20 p-4 rounded border border-amber-100 dark:border-amber-700/40">
            <p className="mb-2 font-bold">{translations.help.subscriptionTitle}</p>
            <p className="mb-4">{translations.help.subscriptionDesc}</p>
            <button
              type="button"
              onClick={onOpenSubscription}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded shadow transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              {translations.help.subscribeButton}
            </button>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <button
                type="button"
                onClick={() => openExternalUrl(TERMS_OF_USE_EULA_URL)}
                className="text-amber-700 dark:text-amber-300 hover:underline font-medium"
              >
                {translations.subscription.termsOfUse}
              </button>
              <button
                type="button"
                onClick={() => openExternalUrl(PRIVACY_POLICY_URL)}
                className="text-amber-700 dark:text-amber-300 hover:underline font-medium"
              >
                {translations.subscription.privacyPolicy}
              </button>
            </div>
          </div>
        </div>
      )}

      {onDeleteAccount && (
        <div className="app-section-card p-6 border-l-4 border-red-400">
          <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {translations.help.deleteAppAccount}
          </h3>
          <p className="text-sm text-slate-600 mb-4">{translations.help.deleteAppAccountDesc}</p>
          <button
            type="button"
            onClick={() => setShowDeleteAccountConfirm(true)}
            className="px-4 py-2 rounded border-2 border-red-500 text-red-600 hover:bg-red-50 font-medium transition"
          >
            {translations.help.deleteAppAccount}
          </button>
        </div>
      )}

      <div className="app-section-card p-6 border-l-4 border-emerald-500">
        <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {translations.help.contact}
        </h3>
        <p className="text-sm text-slate-600 mb-4">{translations.help.contactDesc}</p>
        <button
          type="button"
          onClick={onContactAdmin ?? (() => openMailTo(ADMIN_EMAIL))}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded shadow transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
          </svg>
          {translations.help.contactEmail}
        </button>
      </div>

      <div className="app-section-card p-6 border-l-4 border-slate-500">
        <button
          type="button"
          onClick={() => setDocumentationOpen(open => !open)}
          aria-expanded={documentationOpen}
          className="w-full flex justify-between items-center gap-3 text-left rounded-md -m-1 p-1 hover:bg-slate-50 dark:hover:bg-slate-700/70 transition"
        >
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            {translations.help.documentation}
          </h3>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${documentationOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {documentationOpen && (
          <>
            <div className="flex justify-end gap-2 mt-4 mb-4">
              <button type="button" onClick={handleCopy} className="text-sm px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 transition">
                {copyFeedback ? translations.help.copied : translations.help.copyAll}
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="text-sm px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 transition disabled:opacity-60"
              >
                {pdfLoading ? translations.help.pdfGenerating : translations.help.downloadPdf}
              </button>
            </div>
            {pdfLoading && (
              <div className="fixed inset-0 z-[10039] flex flex-col items-center justify-center gap-3 bg-white">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-indigo-600" />
                <p className="text-sm text-slate-600">{translations.help.pdfGenerating}</p>
              </div>
            )}
            <div
              ref={documentationRef}
              data-pdf-documentation
              className="max-w-none text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 selection:bg-indigo-200 selection:text-slate-900 dark:selection:bg-indigo-600 dark:selection:text-white"
            >
              <DocumentationContent content={content} />
            </div>
          </>
        )}
      </div>

      {showDeleteAccountConfirm && onDeleteAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 text-center">
            <h3 className="text-lg font-bold mb-2 text-red-600">
              {translations.help.confirmDeleteAppAccount}
            </h3>
            <p className="text-slate-600 mb-6">
              {translate('help.confirmDeleteAppAccountMessage', language, { user: currentUser })}
            </p>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={() => setShowDeleteAccountConfirm(false)}
                className={MODAL_CANCEL_BUTTON}
              >
                {translations.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteAccountConfirm(false);
                  onDeleteAccount();
                }}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 shadow"
              >
                {translations.help.deleteAppAccount}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImportFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl max-sm w-full p-6 text-center">
            <h3 className="text-lg font-bold mb-2 text-red-600">{translations.help.confirmImport}</h3>
            <p className="text-slate-600 mb-6">
              {translate('help.confirmImportMessage', language, { fileName: pendingImportFile.name })}
              <br />
              {translations.help.confirmImportWarning}
            </p>
            <div className="flex justify-center gap-4">
              <button type="button" onClick={cancelImport} className={MODAL_CANCEL_BUTTON}>
                {translations.common.cancel}
              </button>
              <button type="button" onClick={confirmImport} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 shadow">
                {translations.help.confirmOverride}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HelpView;
