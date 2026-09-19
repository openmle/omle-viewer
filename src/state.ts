// App state — loaded model, selection, validation results, execution logs.

import type { OMLEModel, StepSnapshot } from '@openmle/omle.js';
import type { ValidationResult } from '@openmle/omle.js';

// ── Drill-down navigation ─────────────────────────────────────────────────────

export type DrillView =
  | { kind: 'top_graph' }
  | { kind: 'composite'; compositePath: string[] }
  | { kind: 'tree_ensemble'; nodeName: string }
  | { kind: 'tree'; ensembleName: string; treeIndex: number }
  | { kind: 'clustering'; nodeName: string }
  | { kind: 'linear'; nodeName: string }
  | { kind: 'naive_bayes'; nodeName: string }
  | { kind: 'svm'; nodeName: string }
  | { kind: 'neural_network'; nodeName: string }
  | { kind: 'knn'; nodeName: string };

export interface NavEntry {
  view: DrillView;
  label: string;
}

// ── Selection ─────────────────────────────────────────────────────────────────

export type SelectionKind =
  | 'node'
  | 'tensor'
  | 'input'
  | 'output'
  | 'feature'
  | 'target'
  | 'function'
  | 'verification'
  | 'warmup'
  | 'sample_input'
  | 'overview';

export interface Selection {
  kind: SelectionKind;
  id: string;       // node name, tensor id, input/output name, etc.
  index?: number;   // positional index in its list, if relevant
  compositePath?: string[];  // path into nested composites for node selections
}

// ── Log entries ───────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  id: number;
  level: LogLevel;
  timestamp: Date;
  message: string;
}

// ── App state ─────────────────────────────────────────────────────────────────

export interface AppState {
  model: OMLEModel | null;
  fileName: string | null;
  fileSize: number | null;   // bytes; estimated when loaded from pasted JSON
  fileSizeEstimated: boolean;
  selection: Selection | null;
  selectionHistory: (Selection | null)[];
  selectionCursor: number;
  validation: ValidationResult | null;
  logs: LogEntry[];
  inferenceInputJson: string;
  inferenceOutputJson: string | null;
  isRunningInference: boolean;
  inferenceSteps: StepSnapshot[] | null;
  inferenceStepIdx: number;   // -1 = no active step
  navHistory: NavEntry[];
  navCursor: number;
  sidebarWidth: number;
  inspectorWidth: number;
  bottomHeight: number;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'LOAD_MODEL'; model: OMLEModel; fileName: string; validation: ValidationResult; fileSize?: number; fileSizeEstimated?: boolean }
  | { type: 'CLEAR_MODEL' }
  | { type: 'SET_SELECTION'; selection: Selection | null }
  | { type: 'SELECTION_BACK' }
  | { type: 'SELECTION_FORWARD' }
  | { type: 'SET_VALIDATION'; validation: ValidationResult }
  | { type: 'ADD_LOG'; entry: Omit<LogEntry, 'id' | 'timestamp'> }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SET_INFERENCE_INPUT'; json: string }
  | { type: 'SET_INFERENCE_OUTPUT'; json: string | null }
  | { type: 'SET_RUNNING_INFERENCE'; running: boolean }
  | { type: 'SET_INFERENCE_STEPS'; steps: StepSnapshot[] | null }
  | { type: 'SET_INFERENCE_STEP_IDX'; idx: number }
  | { type: 'NAV_PUSH'; entry: NavEntry }
  | { type: 'NAV_BACK' }
  | { type: 'NAV_FORWARD' }
  | { type: 'NAV_GOTO'; cursor: number }
  | { type: 'RESIZE_SIDEBAR'; width: number }
  | { type: 'RESIZE_INSPECTOR'; width: number }
  | { type: 'RESIZE_BOTTOM'; height: number };

// ── Reducer ───────────────────────────────────────────────────────────────────

let nextLogId = 1;

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_MODEL': {
      const initSel: Selection = { kind: 'overview', id: 'overview' };
      return {
        ...state,
        model: action.model,
        fileName: action.fileName,
        fileSize: action.fileSize ?? null,
        fileSizeEstimated: action.fileSizeEstimated ?? false,
        validation: action.validation,
        selection: initSel,
        selectionHistory: [initSel],
        selectionCursor: 0,
        inferenceInputJson: '{}',
        inferenceOutputJson: null,
        inferenceSteps: null,
        inferenceStepIdx: -1,
        navHistory: [{ view: { kind: 'top_graph' }, label: 'Top Graph' }],
        navCursor: 0,
      };
    }

    case 'CLEAR_MODEL':
      return {
        ...state,
        model: null,
        fileName: null,
        fileSize: null,
        fileSizeEstimated: false,
        selection: null,
        selectionHistory: [null],
        selectionCursor: 0,
        validation: null,
        inferenceInputJson: '{}',
        inferenceOutputJson: null,
      };

    case 'SET_SELECTION': {
      const history = state.selectionHistory.slice(0, state.selectionCursor + 1);
      return {
        ...state,
        selection: action.selection,
        selectionHistory: [...history, action.selection],
        selectionCursor: history.length,
      };
    }

    case 'SELECTION_BACK': {
      const cursor = Math.max(0, state.selectionCursor - 1);
      return { ...state, selectionCursor: cursor, selection: state.selectionHistory[cursor] ?? null };
    }

    case 'SELECTION_FORWARD': {
      const cursor = Math.min(state.selectionHistory.length - 1, state.selectionCursor + 1);
      return { ...state, selectionCursor: cursor, selection: state.selectionHistory[cursor] ?? null };
    }

    case 'SET_VALIDATION':
      return { ...state, validation: action.validation };

    case 'ADD_LOG':
      return {
        ...state,
        logs: [
          ...state.logs,
          { ...action.entry, id: nextLogId++, timestamp: new Date() },
        ],
      };

    case 'CLEAR_LOGS':
      return { ...state, logs: [] };

    case 'SET_INFERENCE_INPUT':
      return { ...state, inferenceInputJson: action.json };

    case 'SET_INFERENCE_OUTPUT':
      return { ...state, inferenceOutputJson: action.json };

    case 'SET_RUNNING_INFERENCE':
      return { ...state, isRunningInference: action.running };

    case 'SET_INFERENCE_STEPS':
      return { ...state, inferenceSteps: action.steps, inferenceStepIdx: action.steps ? 0 : -1 };

    case 'SET_INFERENCE_STEP_IDX':
      return { ...state, inferenceStepIdx: action.idx };

    case 'NAV_PUSH': {
      const history = state.navHistory.slice(0, state.navCursor + 1);
      return { ...state, navHistory: [...history, action.entry], navCursor: history.length };
    }
    case 'NAV_BACK':
      return { ...state, navCursor: Math.max(0, state.navCursor - 1) };
    case 'NAV_FORWARD':
      return { ...state, navCursor: Math.min(state.navHistory.length - 1, state.navCursor + 1) };
    case 'NAV_GOTO':
      return { ...state, navCursor: Math.max(0, Math.min(state.navHistory.length - 1, action.cursor)) };

    case 'RESIZE_SIDEBAR':
      return { ...state, sidebarWidth: Math.max(180, Math.min(480, action.width)) };

    case 'RESIZE_INSPECTOR':
      return { ...state, inspectorWidth: Math.max(200, Math.min(600, action.width)) };

    case 'RESIZE_BOTTOM':
      return { ...state, bottomHeight: Math.max(80, Math.min(400, action.height)) };

    default:
      return state;
  }
}

export const initialState: AppState = {
  model: null,
  fileName: null,
  fileSize: null,
  fileSizeEstimated: false,
  selection: null,
  selectionHistory: [null],
  selectionCursor: 0,
  validation: null,
  logs: [],
  inferenceInputJson: '{}',
  inferenceOutputJson: null,
  isRunningInference: false,
  inferenceSteps: null,
  inferenceStepIdx: -1,
  navHistory: [{ view: { kind: 'top_graph' }, label: 'Top Graph' }],
  navCursor: 0,
  sidebarWidth: 240,
  inspectorWidth: 320,
  bottomHeight: 180,
};
