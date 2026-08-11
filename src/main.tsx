import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installApiShim } from './local/api';
import { getDb } from './local/db';
import { startBackgroundScheduler } from './local/checker';

/**
 * There is no Express server in the app, so the local API shim must be in
 * place before any component can issue a fetch. We also open the database and
 * start the periodic checker up front, mirroring what server.ts does on boot.
 */
async function bootstrap() {
  installApiShim();
  await getDb();
  startBackgroundScheduler();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap().catch((err) => {
  console.error('Startup failed:', err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding:24px;font-family:system-ui;color:#b91c1c">
      <h2>Startup failed</h2><pre style="white-space:pre-wrap">${String(err?.message || err)}</pre>
    </div>`;
  }
});
