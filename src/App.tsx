import React, { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import { fromJSON, fromProtoBinary, validate, Engine, validateInputs } from '@openmle/omle.js';
import type { AppState, Action, LogEntry } from './state.ts';
import { reducer, initialState } from './state.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { CenterPanel } from './components/CenterPanel.tsx';
import { Inspector } from './components/Inspector.tsx';
import { BottomPanel } from './components/BottomPanel.tsx';

// ── Context ───────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  loadFile: (file: File) => Promise<void>;
  loadJson: (text: string) => string | null;  // returns error message or null on success
  runInference: (overrideJson?: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

// ── Root component ─────────────────────────────────────────────────────────────

export default function App({ initialModelJson, widgetMode = false }: {
  initialModelJson?: string;
  widgetMode?: boolean;
} = {}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    dispatch({ type: 'ADD_LOG', entry: { level, message } });
  }, []);

  // Load model passed in from the widget host (e.g. Jupyter)
  useEffect(() => {
    if (!initialModelJson) return;
    try {
      const model = fromJSON(initialModelJson);
      const validation = validate(model);
      const byteSize = new Blob([initialModelJson]).size;
      dispatch({ type: 'LOAD_MODEL', model, fileName: 'notebook-model', validation, fileSize: byteSize });
    } catch (e) {
      dispatch({ type: 'ADD_LOG', entry: { level: 'error', message: `Failed to load model: ${(e as Error).message}` } });
    }
  // Re-run when the serialized model string changes (widget.update() call)

  }, [initialModelJson]);

  const loadFile = useCallback(async (file: File) => {
    try {
      addLog('info', `Loading ${file.name}…`);
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const isProto = ext === 'omle';
      let model;
      if (isProto) {
        const buf = await file.arrayBuffer();
        model = fromProtoBinary(buf);
      } else {
        const text = await file.text();
        model = fromJSON(text);
      }
      const validation = validate(model);
      dispatch({ type: 'LOAD_MODEL', model, fileName: file.name, validation, fileSize: file.size });

      if (validation.valid) {
        addLog('success', `Loaded ${file.name} — ${model.nodes?.length ?? 0} nodes, ${model.tensor_entries?.length ?? 0} tensors`);
      } else {
        addLog('warn', `Loaded ${file.name} with ${validation.errors.length} validation error(s)`);
        for (const err of validation.errors.slice(0, 5)) {
          addLog('error', `[${err.path}] ${err.message}`);
        }
      }
    } catch (e) {
      addLog('error', `Failed to load ${file.name}: ${(e as Error).message}`);
    }
  }, [addLog]);

  const loadJson = useCallback((text: string): string | null => {
    try {
      const model = fromJSON(text);
      const validation = validate(model);
      const byteSize = new Blob([text]).size;
      dispatch({ type: 'LOAD_MODEL', model, fileName: 'model.json', validation, fileSize: byteSize, fileSizeEstimated: true });
      if (validation.valid) {
        addLog('success', `Loaded model from JSON — ${model.nodes?.length ?? 0} nodes, ${model.tensor_entries?.length ?? 0} tensors`);
      } else {
        addLog('warn', `Loaded model from JSON with ${validation.errors.length} validation error(s)`);
        for (const err of validation.errors.slice(0, 5)) {
          addLog('error', `[${err.path}] ${err.message}`);
        }
      }
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [addLog]);

  const runInference = useCallback((overrideJson?: string) => {
    const { model, inferenceInputJson } = state;
    if (!model) return;
    dispatch({ type: 'SET_RUNNING_INFERENCE', running: true });
    try {
      const rawInputs = JSON.parse(overrideJson ?? inferenceInputJson);

      const inputCheck = validateInputs(model, rawInputs);
      if (!inputCheck.valid) {
        const lines = inputCheck.issues.map(iss => `  • ${iss.message}`);
        const detail = `Payload validation failed — ${inputCheck.issues.length} issue${inputCheck.issues.length > 1 ? 's' : ''}:\n\n${lines.join('\n')}`;
        const missing = inputCheck.issues.filter(i => i.kind === 'missing').map(i => `"${i.name}"`);
        const logSummary = missing.length > 0
          ? `Payload validation failed: missing ${missing.join(', ')}`
          : `Payload validation failed: ${inputCheck.issues[0].message}`;
        dispatch({ type: 'SET_INFERENCE_OUTPUT', json: detail });
        addLog('error', logSummary);
        return;
      }

      const engine = new Engine(model);
      const { output, steps } = engine.runWithSteps(rawInputs);
      // Convert TypedArrays to plain arrays so JSON.stringify produces readable output
      const serializable: Record<string, unknown> = {};
      for (const [name, td] of Object.entries(output)) {
        serializable[name] = {
          dtype: td.dtype,
          shape: td.shape,
          data: Array.from(td.data as Iterable<unknown>),
        };
      }
      dispatch({ type: 'SET_INFERENCE_OUTPUT', json: JSON.stringify(serializable, null, 2) });
      dispatch({ type: 'SET_INFERENCE_STEPS', steps });
      addLog('success', `Inference completed — ${steps.length} steps`);
    } catch (e) {
      dispatch({ type: 'SET_INFERENCE_OUTPUT', json: null });
      addLog('error', `Inference failed: ${(e as Error).message}`);
    } finally {
      dispatch({ type: 'SET_RUNNING_INFERENCE', running: false });
    }
  }, [state, addLog]);

  return (
    <AppContext.Provider value={{ state, dispatch, loadFile, loadJson, runInference }}>
      <Layout widgetMode={widgetMode} />
    </AppContext.Provider>
  );
}

// ── Four-panel layout ─────────────────────────────────────────────────────────

function Layout({ widgetMode = false }: { widgetMode?: boolean }) {
  const { state, dispatch } = useApp();
  const { sidebarWidth, inspectorWidth, bottomHeight } = state;

  const isDraggingSidebar = useRef(false);
  const isDraggingInspector = useRef(false);
  const isDraggingBottom = useRef(false);

  const startDrag = (
    ref: React.MutableRefObject<boolean>,
    onMove: (delta: number) => void,
  ) => (e: React.MouseEvent) => {
    e.preventDefault();
    ref.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const onMouseMove = (ev: MouseEvent) => {
      if (!ref.current) return;
      onMove(ref === isDraggingBottom ? ev.clientY - startY : ev.clientX - startX);
    };
    const onMouseUp = () => {
      ref.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const _sidebarDelta = 0;
  const _inspectorDelta = 0;
  const _bottomDelta = 0;

  return (
    <div style={{ ...styles.root, height: widgetMode ? '100%' : '100vh', width: widgetMode ? '100%' : '100vw' }}>
      {/* Left sidebar */}
      <div style={{ ...styles.sidebar, width: sidebarWidth }}>
        <Sidebar />
      </div>

      {/* Sidebar resize handle */}
      <div
        style={styles.handleV}
        onMouseDown={startDrag(isDraggingSidebar, delta => {
          dispatch({ type: 'RESIZE_SIDEBAR', width: sidebarWidth + delta });
        })}
      />

      {/* Center + bottom */}
      <div style={styles.centerColumn}>
        <div style={styles.centerPanel}>
          <CenterPanel />
        </div>

        {/* Bottom resize handle */}
        <div
          style={styles.handleH}
          onMouseDown={startDrag(isDraggingBottom, delta => {
            dispatch({ type: 'RESIZE_BOTTOM', height: bottomHeight - delta });
          })}
        />

        <div style={{ ...styles.bottomPanel, height: bottomHeight }}>
          <BottomPanel />
        </div>
      </div>

      {/* Inspector resize handle */}
      <div
        style={styles.handleV}
        onMouseDown={startDrag(isDraggingInspector, delta => {
          dispatch({ type: 'RESIZE_INSPECTOR', width: inspectorWidth - delta });
        })}
      />

      {/* Right inspector */}
      <div style={{ ...styles.inspector, width: inspectorWidth }}>
        <Inspector />
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'row',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    background: 'var(--t-bg)',
    color: 'var(--t-text)',
    fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
    fontSize: 13,
  },
  sidebar: {
    flexShrink: 0,
    overflow: 'hidden',
    borderRight: '1px solid var(--t-border)',
    display: 'flex',
    flexDirection: 'column',
  },
  centerColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
  centerPanel: {
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  bottomPanel: {
    flexShrink: 0,
    overflow: 'hidden',
    borderTop: '1px solid var(--t-border)',
  },
  inspector: {
    flexShrink: 0,
    overflow: 'hidden',
    borderLeft: '1px solid var(--t-border)',
    display: 'flex',
    flexDirection: 'column',
  },
  handleV: {
    width: 4,
    flexShrink: 0,
    cursor: 'col-resize',
    background: 'transparent',
    transition: 'background 0.15s',
  },
  handleH: {
    height: 4,
    flexShrink: 0,
    cursor: 'row-resize',
    background: 'transparent',
  },
};
