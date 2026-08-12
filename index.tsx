import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  rootElement.innerHTML =
    '<div style="padding:24px;font-family:system-ui,sans-serif;color:#b91c1c;">React 啟動失敗：<br>' +
    msg +
    '</div>';
}
