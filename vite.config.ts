import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { resolveVersion } from './version';

const version = resolveVersion(__dirname);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
  server: {
    fs: {
      // Allow importing the proto schema from the sibling omle repo
      allow: [resolve(__dirname, '..')],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
