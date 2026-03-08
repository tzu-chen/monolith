import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import 'katex/dist/katex.min.css';
import './global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
