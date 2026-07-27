import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { obterTema } from './lib/tema.js';
import './styles.css';

document.documentElement.setAttribute('data-theme', obterTema());

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
