import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';
import { applyCachedLook } from './theme/useLook';

applyCachedLook();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
