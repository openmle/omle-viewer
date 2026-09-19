# omle-viewer

Fully client-side model inspection and debugging tool for [OMLE](https://github.com/openmle) models. Built on React 18, Vite, and [omle.js](../omle.js).

No server required — drop a `.json`, `.omle`, or `.omle` model file into the browser and explore.

## Features

### Graph canvas
- **Pan and zoom** — scroll to zoom, drag background to pan, toolbar buttons for fit-to-view / ±zoom.
- **Drag nodes** — reposition individual nodes manually; layout resets when a new model is loaded.
- **Auto-layout** — Sugiyama-style layered layout (topological rank → barycenter sort → stacked columns).
- **Mini-map** — fixed overlay in the bottom-right corner with a viewport rectangle; click to navigate.
- **Lineage highlighting** — select a node to highlight its full upstream and downstream subgraph; unrelated nodes are dimmed.
- **Collapse / expand nodes** — toggle the output-port list on any node to reduce visual clutter.
- **Composite drill-down** — click ⊕ on a composite node to enter its nested canvas; a breadcrumb trail lets you navigate back up. Shows inherited inputs, input aliases, internal nodes, output aliases, and published outputs.
- **Scope view** — toggle ⊞ to open a side panel that lists the names visible in the namespace after each execution step, grouped by the node that introduced them.

### Node rendering
Each node card shows:
- Node name and body-type badge (`Tree`, `Ensemble`, `Linear`, `NeuralNet`, etc.)
- Operator-specific icon (🌳 tree/ensemble, 📐 linear, 🧠 neural net, 🎲 naïve Bayes, ⬡ clustering, ⊗ SVM, ☑ scorecard/ruleset, 📦 composite, ⚙ generic)
- Output port list with names and type labels
- Validation error (`!`) and warning (`⚠`) badges

### Edge rendering
- Cubic-bezier curves with arrowheads
- Value name shown on hover / when selected
- Hover tooltip: tensor name, dtype, shape, measure level, output role

### Inference playback
Run inference from the **Inference** tab (bottom panel), then step through the execution on the graph:
- A playback bar appears at the bottom of the canvas (⏮ ⏪ ▶/⏸ ⏩ ⏭).
- Progress track with per-node dot markers; warning dots are highlighted.
- The active node gets a blue glow; executed nodes get a green tint; pending nodes are dimmed.
- Input edges to the active node are colored blue; output edges green.
- A value card appears beside the active node showing its input and output values (up to 50 elements), shape, and any warnings or null-propagation events.
- The canvas auto-scrolls to keep the active node visible during playback.

### Detail views (right inspector)
Context-sensitive panel for the currently selected item:
- **Node** — body type, inputs/outputs, attributes, validation messages, raw JSON
- **Tensor entry** — dense matrix view (table for 2-D, flat chips for 1-D/scalar), sparse CSR preview, raw JSON tab
- **Input / Output** — type, shape, dtype, role, binding, domain
- **Feature** — measure level, missing/invalid/outlier policies, domain intervals/values
- **Function** — parameters, result type, body expression
- **Verification** — test case inputs/outputs and tolerance

### Bottom panel tabs
- **Logs** — timestamped load / inference / error messages
- **Validation** — full list of errors and warnings with paths
- **Inference** — JSON input editor, Run button, formatted output display

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and drop an OMLE `.json` model file onto the canvas.

### Building for production

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
```

## Usage

1. **Load a model** — drag-and-drop a `.json`, `.omle`, or `.omle` file onto the empty canvas, or use the file input.
2. **Explore the graph** — pan with drag, zoom with scroll. Click a node to inspect it in the right panel.
3. **Trace lineage** — click a node; its upstream and downstream subgraph highlights automatically.
4. **Enter a composite** — click ⊕ on a composite node to drill into its nested graph. Use the breadcrumb to navigate back.
5. **Run inference** — open the **Inference** tab, paste input JSON (scalars, arrays, or full `TensorData` objects), and click **Run**.
6. **Step through execution** — after inference, use the playback bar to walk through each node in topological order and see its exact input and output values.

### Input JSON formats

The inference panel accepts any of:

```json
{ "x": 1.5, "y": -0.3 }
```
```json
{ "features": [1.5, -0.3, 0.8] }
```
```json
{ "X": [[1.5, -0.3, 0.8], [2.1, 0.4, -1.2]] }
```
```json
{ "X": { "dtype": "FLOAT64", "shape": [1, 3], "data": [1.5, -0.3, 0.8] } }
```

## Project structure

```
src/
  App.tsx                   — root layout, AppContext, loadFile, runInference
  state.ts                  — AppState, Action, reducer
  proto-loader.ts           — decodes .omle binary files via protobufjs
  components/
    Sidebar.tsx             — left nav tree
    CenterPanel.tsx         — graph canvas host, drop target
    Inspector.tsx           — right detail panel
    BottomPanel.tsx         — logs / validation / inference tabs
    graph/
      GraphCanvas.tsx       — pan/zoom SVG, playback orchestration
      NodeCard.tsx          — SVG node card renderer
      EdgePath.tsx          — SVG cubic-bezier edge with tooltip
      MiniMap.tsx           — mini-map overlay
      ScopeView.tsx         — namespace scope debugger panel
      StepOverlay.tsx       — per-step input/output value card
      layout.ts             — graph data types, Sugiyama layout, lineage
    views/
      OverviewView.tsx      — model metadata summary
      NodeView.tsx          — node detail
      TensorView.tsx        — tensor data display
      InputOutputView.tsx   — input / output spec
      FeatureView.tsx       — schema feature detail
      FunctionView.tsx      — user-defined function
      VerificationView.tsx  — verification cases
```

## Dependencies

| Package | Role |
|---|---|
| `react` + `react-dom` | UI framework |
| `vite` + `@vitejs/plugin-react` | Build tool and dev server |
| `omle.js` | Model IR, validation, engine (consumed from source via path alias) |
| `protobufjs` | Decodes `.omle` binary protobuf files |

All rendering is pure SVG — no graph-layout or diagramming libraries.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and the checks a
change needs to pass, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community
expectations.

## License

Apache-2.0
