import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';

// CRA uses REACT_APP_*; support VITE_* if you use the same .env from a Vite app
const PUBLISHABLE_KEY =
  process.env.REACT_APP_CLERK_PUBLISHABLE_KEY ||
  process.env.VITE_CLERK_PUBLISHABLE_KEY ||
  '';
if (!PUBLISHABLE_KEY) {
  console.warn('Missing REACT_APP_CLERK_PUBLISHABLE_KEY (or VITE_CLERK_PUBLISHABLE_KEY). Auth disabled.');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.unregister();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
