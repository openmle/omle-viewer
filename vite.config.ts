import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolveVersion } from './version';
import { localOmleJsConfig } from './localOmleJs';

const version = resolveVersion(__dirname);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  ...localOmleJsConfig(__dirname),
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
