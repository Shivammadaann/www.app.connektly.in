import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {checkFacebookLoginStatus} from './lib/meta-sdk';
import './index.css';

void checkFacebookLoginStatus().catch((error) => {
  console.warn('Facebook SDK or login status check failed.', error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
