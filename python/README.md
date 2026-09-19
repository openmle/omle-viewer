# omle-viewer (Python)

Jupyter display integration and browser CLI for [OMLE](../../omle) models — renders the interactive DAG viewer inline in a notebook cell or opens it in the default browser.

Works in **JupyterLab, Jupyter Notebook, VS Code notebooks, and Google Colab** with no widget extensions required.

## Setup

### 1. Build the viewer bundle

```bash
cd omle-viewer
./build.sh
```

This builds a self-contained `viewer.html` (all JS/CSS inlined) and places it in the package's `static/` directory. Re-run whenever the viewer source changes.

### 2. Install the package

```bash
pip install -e omle-viewer/python/
```

For protobuf (`.omle`) support:

```bash
pip install -e "omle-viewer/python/[proto]"
```

## CLI

Open any model file directly in the browser:

```bash
omle-viewer model.json
omle-viewer model.omle
```

## Jupyter usage

Import `omle_viewer` once per session. After that, returning any `OMLEModel` from a cell renders the interactive diagram automatically:

```python
import omle_viewer
from omle.ir.model import OMLEModel

model = OMLEModel(...)
model                       # ← renders the DAG viewer inline, no show() needed
```

### Custom height or live-update handle

```python
from omle_viewer import show

w = show(model, height=700)

# In another cell, display an updated model in place:
w.update(updated_model)
```

### Open in browser from Python

```python
from omle_viewer import show_in_browser

show_in_browser(model)
```
