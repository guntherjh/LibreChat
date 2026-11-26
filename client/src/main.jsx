import './polyfills/storage';
import './polyfills/regeneratorRuntime';
import { createRoot } from 'react-dom/client';
import { initializeI18n } from './locales/i18n';
import App from './App';
import '@librechat/client/style.css';
import './style.css';
import './mobile.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import { clearTTSCache } from './utils/ttscache';

/** Read-aloud audio lives in memory now; drop what earlier versions persisted to disk. */
void clearTTSCache();

/**
 * Anonymous until `components/System/Pendo` identifies the signed-in user. The router reads no
 * fragment, so clearing it only drops the channel link ticket from recorded URLs. `tempToken` is
 * unique to the 2FA step; the generic `token` is stripped only on the pages that carry one.
 */
window.pendo.initialize({
  visitor: { id: '' },
  location: {
    transforms: [
      { attr: 'hash', action: 'Clear' },
      {
        attr: 'search',
        action: 'ExcludeKeys',
        data: (_search, url) =>
          /\/(?:verify|register|reset-password)\/?$/.test(url.pathname)
            ? ['tempToken', 'token']
            : ['tempToken'],
      },
    ],
  },
});

const container = document.getElementById('root');
const root = createRoot(container);

async function bootstrap() {
  await initializeI18n();

  root.render(
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>,
  );
}

bootstrap().catch((error) => {
  console.error('[i18n] Failed to initialize before render', error);
  root.render(
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>,
  );
});
