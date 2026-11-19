/**
 * Browser entry point.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { wrongChannelRedirect } from './app/channel';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/editor.css';
import './styles/pages.css';
import './styles/lecture.css';
import './styles/habits.css';

// The stable app served at a beta URL (outdated service worker): load the beta.
const redirect = wrongChannelRedirect(window.location);
if (redirect) window.location.replace(redirect);
else renderApp();

/** Mounts the app. */
function renderApp(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
