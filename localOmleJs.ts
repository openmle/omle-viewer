// Opt-in resolution of @openmle/omle.js to a sibling checkout.
//
// For developing the engine and the viewer together:
//
//   OMLE_JS_LOCAL=1 npm run dev
//   OMLE_JS_LOCAL=../somewhere/else/omle.js npm run build:singlefile
//
// It resolves to the engine's TypeScript source, so there is no build step to
// remember and edits hot-reload under `npm run dev`. Opt-in via the
// environment rather than a committed default, so an ordinary install is
// unaffected.
//
// Preferred over `npm link`: that symlink is silently replaced by the
// published package by any `npm install` in this directory (including the one
// `npx` runs to fetch a missing tool), and it trips the dev server's file
// allow-list in exactly the same way this has to work around.

import path from 'node:path';
import type { UserConfig } from 'vite';

export function localOmleJsConfig(projectRoot: string): UserConfig {
  const requested = process.env.OMLE_JS_LOCAL;
  if (!requested) return {};

  const root = path.resolve(
    projectRoot,
    requested === '1' || requested === 'true' ? '../omle.js' : requested,
  );
  const entry = path.join(root, 'src/index.ts');
  console.log(`[omle-viewer] using local omle.js: ${entry}`);

  return {
    resolve: { alias: { '@openmle/omle.js': entry } },
    // The alias points at source, so stop vite pre-bundling the installed
    // copy and serving that instead.
    optimizeDeps: { exclude: ['@openmle/omle.js'] },
    // The engine lives outside this project root, and the dev server refuses
    // to serve anything outside it — every engine module would come back
    // "403 Restricted" and the app would fail to boot.
    server: { fs: { allow: [projectRoot, root] } },
  };
}
