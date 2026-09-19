# Contributing to omle-viewer

Thanks for your interest. This document covers how to work on this repository —
setup, the layout, and the checks a change needs to pass.

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## What lives here

An interactive DAG viewer for OMLE models, in two halves:

- a **Vite/React/TypeScript** app at the repository root, and
- a **Python package** in `python/` that ships the built viewer and renders it
  in Jupyter or the browser.

The format being visualised is defined in
[omle](https://github.com/openmle/omle); model parsing in the browser uses
[omle.js](https://github.com/openmle/omle.js).

## The build step you cannot skip

The Python package serves a single self-contained HTML bundle at
`python/src/omle_viewer/static/viewer.html`. **That file is generated and
gitignored**, so a fresh checkout does not have it.

```bash
./build.sh          # npm install + vite build + copy into the Python package
```

A wheel built without it installs cleanly and then silently renders a red
"viewer bundle has not been built yet" placeholder instead of the viewer. Always
run `./build.sh` before packaging or testing the Python side.

## Getting started

### Frontend

```bash
npm ci
npm run dev              # Vite dev server
npm run typecheck        # tsc --noEmit
npm run lint             # eslint .
npm run build:singlefile # the bundle the Python package ships
```

### Python package

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip

./build.sh
pip install -e "python/[dev]"
ruff check python/
```

## Layout

```
src/                    the React app
  App.tsx               top-level state and layout
  components/
    graph/              canvas, node cards, layout engine, explain views
    views/              inspector tabs
    shared/             icons and primitives
  state.ts              reducer and actions
vite.singlefile.config.ts   the config that produces the shipped bundle
build.sh                build + copy into the Python package
python/
  src/omle_viewer/
    display.py          Jupyter display and model injection
    cli.py              omle-viewer entry point
    static/viewer.html  GENERATED — do not commit, do not edit
```

The Python side is deliberately thin: it injects the model as
`window.__OMLE_MODEL__` into the prebuilt HTML and hands it to Jupyter (via
`srcdoc`, because JupyterLab's CSP blocks `data:` iframes) or to a browser.

## Code style

**TypeScript** is linted by ESLint (`eslint.config.js`) and type-checked by
`tsc`. Neither rewrites source, so existing formatting is preserved — there is
no Prettier step.

React hooks are linted at the long-standing baseline: `rules-of-hooks` as an
error, `exhaustive-deps` as a warning. `eslint-plugin-react-hooks` v6 adds
stricter rules (`refs`, `set-state-in-effect`, `static-components`) that report
25 findings in this codebase; they are left for a dedicated pass rather than
enabled with a wall of suppressions.

**Python** follows the
[Google Python Style Guide](https://google.github.io/styleguide/pyguide.html),
enforced by `ruff check python/` (configured in `python/pyproject.toml`).

Prefix intentionally unused names with `_` — that is the agreed opt-out for both
linters.

## Pre-commit hooks (optional)

```bash
pip install pre-commit
pre-commit install
```

Runs ESLint, `tsc --noEmit`, `ruff`, and the hygiene hooks. The generated
`static/` directory is excluded.

## Packaging note

`python/pyproject.toml` sets `[tool.setuptools_scm] root = ".."` because the
Python project directory is a subdirectory of the git repository. Without it the
build fails with `setuptools-scm was unable to detect version`. The `LICENSE` is
also copied into `python/` so `license-files` can find it.

## Tests and CI

`.github/workflows/test.yml` runs the frontend lint, typecheck and build, and
the Python lint on 3.10 through 3.14.

There is no Python test suite yet; adding one is welcome, and
`display._build_viewer_html` is the natural place to start.

## Reporting bugs

Include the model file, the browser or JupyterLab version, and anything in the
browser console. For rendering problems, a screenshot is worth more than a
description.

## License

Contributions are accepted under the [Apache License 2.0](LICENSE), in
accordance with section 5 of that license. There is no separate CLA.
