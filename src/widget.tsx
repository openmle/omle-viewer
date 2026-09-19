// anywidget entry point — renders the OMLE viewer inside a Jupyter notebook cell.
// Exported `render` function is called by anywidget's infrastructure.

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './ThemeContext.tsx';
import './index.css';

interface AnyModel {
  get<T = unknown>(key: string): T;
  on(event: string, callback: () => void): void;
}

export function render({ model, el }: { model: AnyModel; el: HTMLElement }) {
  const getHeight = () => (model.get<number>('height') || 500);

  el.style.cssText = `height: ${getHeight()}px; overflow: hidden; position: relative;`;

  const root = ReactDOM.createRoot(el);

  function mount() {
    const modelJson = model.get<string>('model_json') || undefined;
    root.render(
      <React.StrictMode>
        <ThemeProvider>
          <App initialModelJson={modelJson} widgetMode={true} />
        </ThemeProvider>
      </React.StrictMode>,
    );
  }

  mount();

  model.on('change:model_json', mount);
  model.on('change:height', () => {
    el.style.height = `${getHeight()}px`;
  });

  return () => root.unmount();
}
