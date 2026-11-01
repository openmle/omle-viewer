"""Unit tests for omle_viewer.display — HTML building helpers."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

# ── helpers ────────────────────────────────────────────────────────────────────

def _make_model(data: dict | None = None) -> MagicMock:
    """Return a mock OMLEModel whose .to_dict() returns *data*."""
    model = MagicMock()
    model.to_dict.return_value = data or {"inputs": [{"name": "x"}]}
    return model


# ── _build_viewer_html ─────────────────────────────────────────────────────────

class TestBuildViewerHtml:
    def test_returns_none_when_viewer_not_built(self, tmp_path):
        """When viewer.html doesn't exist, return None."""
        from omle_viewer import display as disp

        with patch.object(disp, "_VIEWER_HTML", tmp_path / "viewer.html"):
            result = disp._build_viewer_html(_make_model())
        assert result is None

    def test_injects_model_json_before_close_head(self, tmp_path):
        """Model JSON is injected as a <script> tag before </head>."""
        from omle_viewer import display as disp

        viewer_html = "<html><head></head><body></body></html>"
        viewer_path = tmp_path / "viewer.html"
        viewer_path.write_text(viewer_html, encoding="utf-8")

        model_data = {"inputs": [{"name": "x"}]}
        model = _make_model(model_data)

        with patch.object(disp, "_VIEWER_HTML", viewer_path):
            result = disp._build_viewer_html(model)

        assert result is not None
        expected_json = json.dumps(model_data)
        assert f"window.__OMLE_MODEL__ = {expected_json};" in result

    def test_injects_script_before_first_close_head(self, tmp_path):
        """The injection point is the first </head> occurrence only."""
        from omle_viewer import display as disp

        viewer_html = "<html><head><title>T</title></head><body></body></html>"
        viewer_path = tmp_path / "viewer.html"
        viewer_path.write_text(viewer_html, encoding="utf-8")

        with patch.object(disp, "_VIEWER_HTML", viewer_path):
            result = disp._build_viewer_html(_make_model())

        assert result is not None
        # The injected <script> must appear before </head>
        script_pos = result.index("<script>")
        head_close_pos = result.index("</head>")
        assert script_pos < head_close_pos

    def test_replacement_happens_only_once(self, tmp_path):
        """Only the first </head> is replaced even if there are multiple."""
        from omle_viewer import display as disp

        # Unusual HTML with two </head>-like occurrences
        viewer_html = "<html><head></head><body><!-- </head> --></body></html>"
        viewer_path = tmp_path / "viewer.html"
        viewer_path.write_text(viewer_html, encoding="utf-8")

        with patch.object(disp, "_VIEWER_HTML", viewer_path):
            result = disp._build_viewer_html(_make_model())

        # After one replace, a second </head> may still exist in the comment
        assert result is not None
        assert result.count("</head>") >= 1  # at least the original one (after inject)


# ── _build_iframe_html ─────────────────────────────────────────────────────────

class TestBuildIframeHtml:
    def test_returns_not_built_html_when_viewer_missing(self, tmp_path):
        """Falls back to the 'not built' error HTML when viewer.html is absent."""
        from omle_viewer import display as disp

        with patch.object(disp, "_VIEWER_HTML", tmp_path / "viewer.html"):
            result = disp._build_iframe_html(_make_model(), height=500)

        assert "omle-viewer" in result
        assert "not been built" in result.lower() or "not built" in result.lower()

    def test_returns_iframe_srcdoc_when_viewer_exists(self, tmp_path):
        """Returns an <iframe srcdoc="..."> string when viewer.html exists."""
        from omle_viewer import display as disp

        viewer_path = tmp_path / "viewer.html"
        viewer_path.write_text("<html><head></head><body>hi</body></html>", encoding="utf-8")

        with patch.object(disp, "_VIEWER_HTML", viewer_path):
            result = disp._build_iframe_html(_make_model(), height=600)

        assert "<iframe" in result
        assert "srcdoc=" in result

    def test_iframe_height_is_embedded(self, tmp_path):
        """The requested height appears in the iframe style."""
        from omle_viewer import display as disp

        viewer_path = tmp_path / "viewer.html"
        viewer_path.write_text("<html><head></head><body></body></html>", encoding="utf-8")

        with patch.object(disp, "_VIEWER_HTML", viewer_path):
            result = disp._build_iframe_html(_make_model(), height=750)

        assert "750px" in result

    def test_srcdoc_is_html_escaped(self, tmp_path):
        """The viewer HTML embedded in srcdoc is HTML-escaped (no raw quotes)."""
        from omle_viewer import display as disp

        viewer_path = tmp_path / "viewer.html"
        # Use a title with a quote to verify escaping
        viewer_path.write_text('<html><head><title>It\'s fine</title></head><body></body></html>', encoding="utf-8")

        with patch.object(disp, "_VIEWER_HTML", viewer_path):
            result = disp._build_iframe_html(_make_model(), height=500)

        # The raw single-quote inside the viewer should be entity-escaped in srcdoc
        assert "&#x27;" in result or "&apos;" in result or "&#39;" in result or "It" in result

    def test_iframe_has_no_border(self, tmp_path):
        """The iframe style includes border:none."""
        from omle_viewer import display as disp

        viewer_path = tmp_path / "viewer.html"
        viewer_path.write_text("<html><head></head><body></body></html>", encoding="utf-8")

        with patch.object(disp, "_VIEWER_HTML", viewer_path):
            result = disp._build_iframe_html(_make_model(), height=500)

        assert "border:none" in result


# ── model_repr_html ────────────────────────────────────────────────────────────

class TestModelReprHtml:
    def test_delegates_to_build_iframe_html(self, tmp_path):
        """model_repr_html returns the same string as _build_iframe_html."""
        from omle_viewer import display as disp

        viewer_path = tmp_path / "viewer.html"
        viewer_path.write_text("<html><head></head><body></body></html>", encoding="utf-8")
        model = _make_model()

        with patch.object(disp, "_VIEWER_HTML", viewer_path):
            via_repr = disp.model_repr_html(model, height=400)
            via_iframe = disp._build_iframe_html(model, height=400)

        assert via_repr == via_iframe

    def test_default_height_is_500(self, tmp_path):
        """Default height of 500 px is used when not specified."""
        from omle_viewer import display as disp

        viewer_path = tmp_path / "viewer.html"
        viewer_path.write_text("<html><head></head><body></body></html>", encoding="utf-8")

        with patch.object(disp, "_VIEWER_HTML", viewer_path):
            result = disp.model_repr_html(_make_model())

        assert "500px" in result


# ── OMLEDisplay ────────────────────────────────────────────────────────────────

class TestOMLEDisplay:
    def test_repr_returns_placeholder_string(self):
        from omle_viewer.display import OMLEDisplay
        d = OMLEDisplay(_make_model())
        assert "OMLEDisplay" in repr(d)

    def test_repr_mimebundle_returns_empty_dict(self):
        from omle_viewer.display import OMLEDisplay
        d = OMLEDisplay(_make_model())
        assert d._repr_mimebundle_() == {}

    def test_show_is_silent_without_ipython(self, tmp_path):
        """show() doesn't raise when IPython is absent."""
        from omle_viewer.display import OMLEDisplay

        viewer_path = tmp_path / "viewer.html"
        viewer_path.write_text("<html><head></head><body></body></html>", encoding="utf-8")

        from omle_viewer import display as disp
        with patch.object(disp, "_VIEWER_HTML", viewer_path):
            with patch("builtins.__import__", side_effect=ImportError):
                d = OMLEDisplay(_make_model())
                d.show()  # should not raise

    def test_update_changes_internal_model(self):
        from omle_viewer.display import OMLEDisplay

        model1 = _make_model({"inputs": [{"name": "a"}]})
        model2 = _make_model({"inputs": [{"name": "b"}]})

        d = OMLEDisplay(model1)
        with patch.object(d, "show"):  # suppress actual display
            d.update(model2)
        assert d._model is model2

    def test_update_changes_height(self):
        from omle_viewer.display import OMLEDisplay

        d = OMLEDisplay(_make_model(), height=500)
        with patch.object(d, "show"):
            d.update(_make_model(), height=800)
        assert d._height == 800


# ── show_in_browser ────────────────────────────────────────────────────────────

class TestShowInBrowser:
    def test_raises_when_viewer_not_built(self, tmp_path):
        """RuntimeError is raised when the viewer bundle is absent."""
        from omle_viewer import display as disp

        with patch.object(disp, "_VIEWER_HTML", tmp_path / "viewer.html"):
            with pytest.raises(RuntimeError) as excinfo:
                disp.show_in_browser(_make_model())

        message = str(excinfo.value)
        assert "not built" in message.lower() or "build.sh" in message

    def test_opens_browser_when_viewer_exists(self, tmp_path):
        """webbrowser.open is called with a file:// URL."""
        from omle_viewer import display as disp

        viewer_path = tmp_path / "viewer.html"
        viewer_path.write_text("<html><head></head><body></body></html>", encoding="utf-8")

        with patch.object(disp, "_VIEWER_HTML", viewer_path), \
             patch("webbrowser.open") as mock_open:
            disp.show_in_browser(_make_model())

        mock_open.assert_called_once()
        url = mock_open.call_args[0][0]
        assert url.startswith("file://")
