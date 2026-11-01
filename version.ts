import { execSync } from 'node:child_process';

/**
 * The version stamped into the UI as `__APP_VERSION__`.
 *
 * The git tag is the source of truth, mirroring how the Python package versions
 * itself with setuptools-scm — so a `v0.2.0` tag yields "0.2.0" in both halves
 * of this repo. package.json's version field is deliberately not consulted:
 * keeping a number there invites it to drift from the tag.
 *
 * Falls back to "0.0.0+unknown", the same sentinel omle_viewer.__init__ uses
 * when its generated _version module is absent.
 */
export function resolveVersion(root: string): string {
  // A tag push in CI. GITHUB_REF_NAME is authoritative here and cheaper than
  // shelling out; it also works when the checkout is too shallow for describe.
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME.replace(/^v/, '');
  }

  // Anywhere else: the nearest tag, plus commits-since and a dirty marker, e.g.
  // "0.1.0-3-gabc1234-dirty". Matches what a developer expects from a local build.
  try {
    const described = execSync('git describe --tags --always --dirty', {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (described) return described.replace(/^v/, '');
  } catch {
    // No git, no commits, or no tags reachable — fall through to the sentinel.
  }

  return '0.0.0+unknown';
}
