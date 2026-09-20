# omle-viewer (Python)

Jupyter display integration and browser CLI for [OMLE](https://github.com/openmle/omle)
models — renders the interactive DAG viewer inline in a notebook cell or opens
it in the default browser.

Works in **JupyterLab, Jupyter Notebook, VS Code notebooks, and Google Colab**
with no widget extensions required.

## Installation

```bash
pip install omle-viewer
```

The viewer bundle ships inside the wheel, and `omle` — installed as a
dependency — reads both JSON and protobuf binary models, so there is nothing
else to install and no optional extra to remember.

## CLI

```bash
omle-viewer model.json
omle-viewer model.omle
```

Accepts `.json`, and `.omle` / `.pb` / `.bin` for the protobuf binary encoding.
Writes a temporary self-contained HTML file and opens it with
`webbrowser.open()` — nothing is uploaded and no server runs.

## Jupyter usage

Import `omle_viewer` once per session. After that, returning any `OMLEModel`
from a cell renders the interactive diagram automatically:

```python
import omle
import omle_viewer

model = omle.load("model.omle")
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

### Raw HTML

```python
from omle_viewer import model_repr_html

html = model_repr_html(model, height=500)   # what _repr_html_ returns
```

## Developing from a checkout

The wheel ships a prebuilt `static/viewer.html`; a git checkout does not, and
without it the viewer renders a "not built" placeholder. Build it first, and
re-run after changing the viewer source:

```bash
cd omle-viewer
./build.sh
pip install -e "python/[dev]"
```

See
[CONTRIBUTING.md](https://github.com/openmle/omle-viewer/blob/main/CONTRIBUTING.md)
for the full development setup and the checks a change needs to pass.
