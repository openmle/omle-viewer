"""Unit tests for omle_viewer.cli — argument parsing and error paths."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

# ── helpers ────────────────────────────────────────────────────────────────────

def _run_main(args: list[str]) -> int:
    """Run cli.main() with sys.argv overridden; return the SystemExit code."""
    with patch("sys.argv", ["omle-viewer"] + args):
        try:
            from omle_viewer.cli import main
            main()
            return 0
        except SystemExit as e:
            return int(e.code) if e.code is not None else 0


# ── argument parsing ───────────────────────────────────────────────────────────

class TestCliArgs:
    def test_no_args_opens_the_viewer_empty(self):
        """No arguments → open the viewer on its drop target, exit 0.

        The app renders a drop target when no model is injected, so there is no
        reason to make the file mandatory just to get a window open.
        """
        with patch("omle_viewer.display.show_in_browser") as mock_show:
            code = _run_main([])
        assert code == 0
        mock_show.assert_called_once_with()

    def test_no_args_does_not_require_omle(self):
        """With no model there is nothing to decode, so `omle` is not needed."""
        def fake_import(name, *args, **kwargs):
            if name == "omle":
                raise ImportError("No module named 'omle'")
            return original_import(name, *args, **kwargs)

        original_import = __import__
        with patch("omle_viewer.display.show_in_browser") as mock_show, \
             patch("builtins.__import__", side_effect=fake_import):
            code = _run_main([])
        assert code == 0
        mock_show.assert_called_once_with()

    def test_missing_file_exits_1(self, tmp_path):
        """Nonexistent file path → exit code 1."""
        missing = tmp_path / "nope.json"
        code = _run_main([str(missing)])
        assert code == 1

    def test_missing_file_prints_to_stderr(self, tmp_path, capsys):
        """Nonexistent file path → error message on stderr."""
        missing = tmp_path / "nope.json"
        _run_main([str(missing)])
        captured = capsys.readouterr()
        assert "not found" in captured.err or "nope.json" in captured.err


# ── omle import guard ──────────────────────────────────────────────────────────

class TestOmleImport:
    def test_exits_1_when_omle_not_installed(self, tmp_path):
        """If 'omle' cannot be imported, exit code 1 with helpful message."""
        json_file = tmp_path / "model.json"
        json_file.write_text("{}", encoding="utf-8")

        # Patch the import of 'omle' inside main() to raise ImportError
        original_import = __builtins__.__import__ if hasattr(__builtins__, "__import__") else __import__

        def fake_import(name, *args, **kwargs):
            if name == "omle":
                raise ImportError("No module named 'omle'")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=fake_import):
            code = _run_main([str(json_file)])

        assert code == 1

    def test_missing_omle_prints_install_hint(self, tmp_path, capsys):
        """Import error message mentions how to install omle."""
        json_file = tmp_path / "model.json"
        json_file.write_text("{}", encoding="utf-8")

        original_import = __builtins__.__import__ if hasattr(__builtins__, "__import__") else __import__

        def fake_import(name, *args, **kwargs):
            if name == "omle":
                raise ImportError("No module named 'omle'")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=fake_import):
            _run_main([str(json_file)])

        captured = capsys.readouterr()
        assert "omle" in captured.err
        assert "pip install" in captured.err or "install" in captured.err.lower()


# ── successful load path ───────────────────────────────────────────────────────

class TestCliSuccess:
    def test_json_file_calls_show_in_browser(self, tmp_path):
        """A valid JSON file causes show_in_browser to be called."""
        json_file = tmp_path / "model.json"
        json_file.write_text('{"inputs": [{"name": "x"}]}', encoding="utf-8")

        mock_model = MagicMock()
        mock_omle = MagicMock()
        mock_omle.load.return_value = mock_model

        with patch.dict("sys.modules", {"omle": mock_omle}), \
             patch("omle_viewer.display.show_in_browser") as mock_show:
            _run_main([str(json_file)])

        mock_omle.load.assert_called_once_with(json_file)
        mock_show.assert_called_once_with(mock_model)

    def test_proto_file_calls_load(self, tmp_path):
        """A .omle extension file is loaded via omle.load."""
        proto_file = tmp_path / "model.omle"
        proto_file.write_bytes(b"fake proto bytes")

        mock_model = MagicMock()
        mock_omle = MagicMock()
        mock_omle.load.return_value = mock_model

        with patch.dict("sys.modules", {"omle": mock_omle}), \
             patch("omle_viewer.display.show_in_browser"):
            _run_main([str(proto_file)])

        mock_omle.load.assert_called_once_with(proto_file)

    def test_pb_extension_is_treated_as_proto(self, tmp_path):
        """.pb extension is treated as a proto binary file."""
        pb_file = tmp_path / "model.pb"
        pb_file.write_bytes(b"\x00\x01")

        mock_omle = MagicMock()
        mock_omle.load.return_value = MagicMock()

        with patch.dict("sys.modules", {"omle": mock_omle}), \
             patch("omle_viewer.display.show_in_browser"):
            _run_main([str(pb_file)])

        mock_omle.load.assert_called_once()

    def test_json_load_value_error_exits_1(self, tmp_path, capsys):
        """ValueError from omle.load (bad JSON) → exit code 1."""
        json_file = tmp_path / "model.json"
        json_file.write_text("{}", encoding="utf-8")

        mock_omle = MagicMock()
        mock_omle.load.side_effect = ValueError("bad model format")

        with patch.dict("sys.modules", {"omle": mock_omle}):
            code = _run_main([str(json_file)])

        assert code == 1
        captured = capsys.readouterr()
        assert "bad model format" in captured.err


# ── no-model viewer HTML ───────────────────────────────────────────────────────

class TestEmptyViewerHtml:
    """_build_viewer_html(None) serves the bundle without a model injected."""

    def test_no_model_injects_nothing(self, tmp_path, monkeypatch):
        from omle_viewer import display
        html = "<html><head><title>v</title></head><body></body></html>"
        stub = tmp_path / "viewer.html"
        stub.write_text(html, encoding="utf-8")
        monkeypatch.setattr(display, "_VIEWER_HTML", stub)

        out = display._build_viewer_html(None)
        assert out == html
        # Check for the injected assignment, not the bare identifier: the real
        # bundle contains __OMLE_MODEL__ in its own source (main.tsx reads it),
        # so an identifier check would pass whether or not anything was
        # injected.
        assert "window.__OMLE_MODEL__ = " not in out

    def test_with_model_injects_the_model(self, tmp_path, monkeypatch):
        from unittest.mock import MagicMock

        from omle_viewer import display
        stub = tmp_path / "viewer.html"
        stub.write_text("<html><head></head><body></body></html>", encoding="utf-8")
        monkeypatch.setattr(display, "_VIEWER_HTML", stub)

        model = MagicMock()
        model.to_dict.return_value = {"inputs": [{"name": "x"}]}
        out = display._build_viewer_html(model)
        assert "window.__OMLE_MODEL__ = " in out
        assert '"name": "x"' in out or '"name":"x"' in out

    def test_unbuilt_bundle_returns_none_for_both(self, tmp_path, monkeypatch):
        from omle_viewer import display
        monkeypatch.setattr(display, "_VIEWER_HTML", tmp_path / "missing.html")
        assert display._build_viewer_html(None) is None
