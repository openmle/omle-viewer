import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { resolveVersion } from './version';

const version = resolveVersion(__dirname);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/widget.tsx'),
      formats: ['es'],
      fileName: 'omle-widget',
    },
    outDir: 'dist-widget',
    // Emit CSS as a separate file so Python can load it via anywidget's _css
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: 'omle-widget.[ext]',
      },
    },
  },
});
