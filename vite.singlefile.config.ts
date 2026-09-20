import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolveVersion } from './version';

const version = resolveVersion(__dirname);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-singlefile',
    // Inline everything — no external asset references
    assetsInlineLimit: 100_000_000,
  },
});
