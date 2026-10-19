import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// The app's own fonts, served with it (no Google Fonts): works offline and tells no third party who's using it.
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/atkinson-hyperlegible/400-italic.css';
import '@fontsource/familjen-grotesk/500.css';
import '@fontsource/familjen-grotesk/600.css';
import '@fontsource/familjen-grotesk/700.css';
import './styles/app.css';
import { applyCachedLook } from './theme/useLook';

applyCachedLook();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Lets the app be added to a phone's home screen and open without internet (its own files only, never your figures).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
