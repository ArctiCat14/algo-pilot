import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initAccent } from './theme';
import './styles.css';
import './lists.css';
import './contest-history.css';
import './upsolve.css';

initAccent();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
