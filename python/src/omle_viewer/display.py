"""Jupyter display helpers for OMLE models.

Primary approach: self-contained HTML iframe (works in every Jupyter environment
without any widget extensions — JupyterLab, Classic Notebook, VS Code, Colab).

The viewer HTML is built by running ``./build.sh`` at the repo root and embedded
as a base64 data-URI iframe so it needs no external server or asset loading.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from omle.ir.model import OMLEModel

_STATIC = Path(__file__).parent / "static"
_VIEWER_HTML = _STATIC / "viewer.html"

# ── HTML helpers ──────────────────────────────────────────────────────────────

_NOT_BUILT_HTML = """
<div style="padding:14px 16px;font-family:monospace;font-size:12px;
color:#b00;border:1px solid #f5c0c0;border-radius:6px;background:#fff5f5">
<strong>omle-viewer:</strong> The viewer bundle has not been built yet.<br><br>
Run the following from the repo root, then reinstall the package:<br>
<code style="display:block;margin-top:6px;padding:6px 8px;background:#fff;
border:1px solid #ddd;border-radius:4px">
./build.sh<br>
pip install -e omle-viewer/python/
</code>
</div>
"""


def _build_viewer_html(model: OMLEModel | None) -> str | None:
    """Return the full self-contained viewer HTML, or None if the bundle is not built.

    With *model* given it is injected as ``window.__OMLE_MODEL__`` and the
    viewer opens on it. With *model* None nothing is injected and the viewer
    opens on its drop target, ready for a file to be dragged in or JSON pasted
    — the app already handles the model being absent, so there is no reason to
    require one just to get a window open.
    """
    if not _VIEWER_HTML.exists():
        return None
    viewer = _VIEWER_HTML.read_text(encoding="utf-8")
    if model is None:
        return viewer
    model_json = json.dumps(model.to_dict())
    inject = f"<script>window.__OMLE_MODEL__ = {model_json};</script>"
    return viewer.replace("</head>", inject + "</head>", 1)


def _build_iframe_html(model: OMLEModel, height: int) -> str:
    """Return an ``<iframe srcdoc=...>`` HTML string that embeds the full interactive viewer.

    Uses srcdoc instead of a data: URI because JupyterLab's CSP blocks data: iframes.
    """
    viewer = _build_viewer_html(model)
    if viewer is None:
        return _NOT_BUILT_HTML
    import html as _html
    # srcdoc is same-origin with the parent page so CSP `unsafe-inline` covers it;
    # data: URIs are blocked by JupyterLab's frame-src CSP directive.
    encoded = _html.escape(viewer, quote=True)
    return (
        f'<iframe srcdoc="{encoded}" '
        f'style="width:100%;height:{height}px;border:none;border-radius:4px;" '
        f'allowfullscreen>'
        f"</iframe>"
    )


def show_in_browser(model: OMLEModel | None = None) -> None:
    """Open the interactive DAG viewer in the default web browser.

    Writes a temporary self-contained HTML file and opens it via
    ``webbrowser.open()``. Works from a script, a terminal, or a notebook.

    Parameters
    ----------
    model:
        The OMLEModel instance to visualize, or None to open the viewer empty
        on its drop target.
    """
    import tempfile
    import webbrowser

    viewer = _build_viewer_html(model)
    if viewer is None:
        raise RuntimeError(
            "omle-viewer: viewer bundle not built. "
            "Run ./build.sh at the repo root first."
        )

    with tempfile.NamedTemporaryFile(
        suffix=".html", delete=False, mode="w", encoding="utf-8"
    ) as f:
        f.write(viewer)
        tmp_path = f.name

    webbrowser.open(f"file://{tmp_path}")


# ── Public API ────────────────────────────────────────────────────────────────

class OMLEDisplay:
    """Jupyter display object wrapping an OMLEModel.

    Returned by ``show()`` so callers have a reference, but suppresses the
    cell's auto-display of the return value (the iframe was already shown by
    the explicit ``IPython.display.display()`` call inside ``show()``).
    """

    def __init__(self, model: OMLEModel, height: int = 500) -> None:
        self._model = model
        self._height = height

    # Suppress Jupyter's implicit display of the return value.
    def _repr_mimebundle_(self, **_kwargs):
        return {}

    def __repr__(self) -> str:  # plain-Python fallback
        return "<OMLEDisplay — call .show() to redisplay>"

    def show(self, height: int | None = None) -> None:
        """Re-display the viewer (e.g. after calling .update())."""
        try:
            import warnings

            from IPython.display import HTML, display
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                display(HTML(_build_iframe_html(self._model, height or self._height)))
        except ImportError:
            pass

    def update(self, model: OMLEModel, *, height: int | None = None) -> None:
        """Display an updated model in a new cell output."""
        self._model = model
        if height is not None:
            self._height = height
        self.show()


def model_repr_html(model: OMLEModel, height: int = 500) -> str:
    """Return the ``_repr_html_`` string for *model* (used by the display hook)."""
    return _build_iframe_html(model, height)


def show(model: OMLEModel, height: int = 500) -> OMLEDisplay:
    """Display an OMLEModel DAG inline in a Jupyter notebook.

    Importing ``omle_viewer`` already makes models auto-render when
    returned from a cell, so ``show()`` is mainly useful when you want a
    non-default height or a handle for later updates::

        w = show(model, height=700)
        # push a new model without creating a new cell output:
        w.update(updated_model)

    Parameters
    ----------
    model:
        The OMLEModel instance to visualize.
    height:
        Viewer height in pixels (default 500).
    """
    handle = OMLEDisplay(model, height)
    try:
        import warnings

        from IPython.display import HTML, display
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            display(HTML(_build_iframe_html(model, height)))
    except ImportError:
        pass
    return handle
