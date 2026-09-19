import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './ThemeContext.tsx';
import './index.css';

declare global {
  interface Window {
    // Injected by omle-jupyter when rendering a model inside a notebook iframe.
    __OMLE_MODEL__?: unknown;
  }
}

// When the viewer is embedded as a standalone HTML frame (e.g. from a Jupyter
// notebook), the host page injects the model as a plain JS object. Re-stringify
// it so App's initialModelJson prop receives the same format as fromJSON expects.
const initialModelJson = window.__OMLE_MODEL__ != null
  ? JSON.stringify(window.__OMLE_MODEL__)
  : undefined;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App initialModelJson={initialModelJson} widgetMode={initialModelJson != null} />
    </ThemeProvider>
  </React.StrictMode>,
);
