import React, { useEffect, useState } from 'react';
import type { Node, StepSnapshot, SerializedTensor, AnomalyDetection, Expression } from '@openmle/omle.js';
import { scalarToNumber } from '@openmle/omle.js';
import { useApp } from '../../App.tsx';
import { JsonView } from '../shared/JsonView.tsx';
import { TreeEnsembleIconHtml, NeuralNetworkIconHtml } from '../shared/OMLEIcon.tsx';
import { TreeEnsembleView } from '../graph/explain/TreeEnsembleView.tsx';
import { LinearView } from '../graph/explain/LinearView.tsx';
import { NaiveBayesView } from '../graph/explain/NaiveBayesView.tsx';
import { ClusteringView } from '../graph/explain/ClusteringView.tsx';

function _isMLNode(node: Node): boolean {
  return !!(node.tree || node.tree_ensemble || node.linear || node.neural_network ||
            node.naive_bayes || node.clustering || node.svm || node.anomaly_detection);
}

export function NodeView({ node }: { node: Node }) {
  const { state, dispatch } = useApp();
  const { inferenceSteps } = state;

  const step = inferenceSteps?.find(s => s.nodeId === `node:${node.name}`) ?? null;
  const bodyType = getBodyType(node);

  const titleBlock = (
    <div style={styles.titleRow}>
      <div style={styles.titleFirstLine}>
        <span style={styles.titleIcon}>{nodeIcon(node)}</span>
        <span style={styles.titleName}>{node.name}</span>
      </div>
      {(bodyType || node.domain) && (
        <div style={styles.titleBadges}>
          {bodyType && <span style={styles.bodyBadge}>{bodyType}</span>}
          {node.domain && <span style={styles.domainBadge}>{node.domain}</span>}
        </div>
      )}
    </div>
  );

  // All nodes: tabbed layout
  const tabs = step
    ? ['summary', 'execution', 'raw'] as const
    : ['summary', 'raw'] as const;
  type Tab = typeof tabs[number];

  const [tab, setTab] = useState<Tab>(step ? 'execution' : 'summary');

  // When the selected node changes, switch to execution tab if data is available
  useEffect(() => {
    setTab(step ? 'execution' : 'summary');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.name]);

  return (
    <div style={styles.root}>
      {titleBlock}
      <TabBar tabs={[...tabs]} active={tab} onChange={t => setTab(t as Tab)} />

      {tab === 'summary' && (
        <div style={styles.content}>
          <StaticSummary node={node} dispatch={dispatch} />
        </div>
      )}

      {tab === 'execution' && step && (
        <div style={styles.content}>
          <ExecutionTab step={step} node={node} />
        </div>
      )}

      {tab === 'raw' && (
        <div style={styles.content}>
          <JsonView value={node} />
        </div>
      )}
    </div>
  );
}

// ── Static summary ────────────────────────────────────────────────────────────

function StaticSummary({ node, dispatch }: { node: Node; dispatch: React.Dispatch<import('../../state.ts').Action> }) {
  const goTensor = (id: string) => dispatch({ type: 'SET_SELECTION', selection: { kind: 'tensor', id } });
  const [expandedAttrs, setExpandedAttrs] = useState<Set<string>>(() => new Set());
  const toggleAttr = (name: string) => setExpandedAttrs(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  return (
    <>
      {/* Inputs */}
      {(node.inputs?.length ?? 0) > 0 && (
        <SectionCard label="Inputs">
          {(node.inputs ?? []).map((inp, i) => {
            const name = inp.name?.value ?? (inp.range ? `${inp.range.prefix}[${inp.range.start ?? 0}…${inp.range.end - 1}]` : `input_${i}`);
            return (
              <div key={i} style={styles.ioRow}>
                <span style={styles.ioArrow}>→</span>
                <span style={styles.ioName}>{name}</span>
              </div>
            );
          })}
        </SectionCard>
      )}

      {/* Outputs */}
      {(node.outputs?.length ?? 0) > 0 && (
        <SectionCard label="Outputs">
          {(node.outputs ?? []).map((out, i) => {
            const t = out.type;
            const shape = t?.shape?.length ? `[${t.shape.map((d: number | string) => Number(d) <= 0 ? 'N' : d).join('×')}]` : '';
            const dtype = t?.dtype ?? '';
            return (
              <div key={i} style={styles.ioRow}>
                <span style={styles.ioArrow}>←</span>
                <span style={styles.ioName}>{out.name}</span>
                {(dtype || shape) && (
                  <span style={styles.ioType}>{dtype}{shape}</span>
                )}
                {out.role && out.role !== 'OUTPUT_ROLE_UNSPECIFIED' && (
                  <span style={styles.ioRole}>{out.role}</span>
                )}
              </div>
            );
          })}
        </SectionCard>
      )}

      {/* Attributes */}
      {(node.attributes?.length ?? 0) > 0 && (
        <SectionCard label="Attributes">
          <PropGrid>
            {node.attributes!.map(attr => {
              const isInline = !!(attr.tensor || attr.sparse);
              const expanded = isInline && expandedAttrs.has(attr.name);
              return (
                <React.Fragment key={attr.name}>
                  <span style={styles.propKey}>{attr.name}</span>
                  {attr.tensor_ref
                    ? <button style={styles.tensorLink} onClick={() => goTensor(attr.tensor_ref!.id)}>tensor:{attr.tensor_ref.id}</button>
                    : isInline
                    ? (
                      <button style={styles.inlineTensorBtn} onClick={() => toggleAttr(attr.name)}>
                        <span style={styles.inlineTensorToggle}>{expanded ? '▾' : '▸'}</span>
                        {attr.tensor ? `tensor:${tensorShape(attr.tensor)}` : `sparse:${tensorShape(attr.sparse!)}`}
                      </button>
                    )
                    : <span style={styles.propVal}>{attrValue(attr)}</span>
                  }
                  {expanded && (
                    <div style={styles.inlineTensorExpanded}>
                      <JsonView value={attr.tensor ?? attr.sparse} inline />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </PropGrid>
        </SectionCard>
      )}

      {/* Description (field present in some producer outputs) */}
      {(node as unknown as { description?: string }).description && (
        <SectionCard label="Description">
          <p style={{ margin: 0, fontSize: 12, color: 'var(--t-text3)', lineHeight: 1.5 }}>{(node as unknown as { description: string }).description}</p>
        </SectionCard>
      )}

      {/* Body summary */}
      {node.tree            && <TreeSummary tree={node.tree} />}
      {node.tree_ensemble   && <EnsembleSummary ensemble={node.tree_ensemble} />}
      {node.linear          && <LinearSummary linear={node.linear} onTensorClick={goTensor} />}
      {node.neural_network  && <NNSummary nn={node.neural_network} onTensorClick={goTensor} />}
      {node.naive_bayes     && <NBSummary nb={node.naive_bayes} onTensorClick={goTensor} />}
      {node.clustering      && <ClusterSummary clustering={node.clustering} onTensorClick={goTensor} />}
      {node.svm             && <SVMSummary svm={node.svm} onTensorClick={goTensor} />}
      {node.anomaly_detection  && <AnomalySummary ad={node.anomaly_detection} onTensorClick={goTensor} />}
    </>
  );
}

// ── Execution tab ─────────────────────────────────────────────────────────────

function ExecutionTab({ step, node: _node }: { step: StepSnapshot; node: Node }) {
  const inputEntries  = Object.entries(step.inputs);
  const outputEntries = Object.entries(step.outputs);

  return (
    <>
      {/* Timing + warnings header */}
      <div style={styles.execMeta}>
        <span style={styles.timing}>⏱ {fmtMs(step.durationMs)}</span>
        {step.warnings.length > 0 && (
          <span style={styles.warnBadge}>⚠ {step.warnings.length} warning{step.warnings.length > 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Input values */}
      {inputEntries.length > 0 && (
        <SectionCard label="Inputs">
          {inputEntries.map(([name, t]) => (
            <TensorValue key={name} name={name} tensor={t} role="input" />
          ))}
        </SectionCard>
      )}

      {/* Output values */}
      {outputEntries.length > 0 && (
        <SectionCard label="Outputs">
          {outputEntries.map(([name, t]) => (
            <TensorValue key={name} name={name} tensor={t} role="output" />
          ))}
        </SectionCard>
      )}

      {/* Warnings */}
      {step.warnings.length > 0 && (
        <SectionCard label="Warnings">
          {step.warnings.map((w, i) => (
            <div key={i} style={styles.warnRow}>⚠ {w}</div>
          ))}
        </SectionCard>
      )}

      {/* Structured explain */}
      {step.explain && (
        <SectionCard label="Explanation" noPad>
          {step.explain.type === 'tree_ensemble' && <TreeEnsembleView explain={step.explain} />}
          {step.explain.type === 'linear'        && <LinearView       explain={step.explain} />}
          {step.explain.type === 'naive_bayes'   && <NaiveBayesView   explain={step.explain} />}
          {step.explain.type === 'clustering'    && <ClusteringView   explain={step.explain} />}
        </SectionCard>
      )}
    </>
  );
}

// ── Tensor value display ──────────────────────────────────────────────────────

function TensorValue({ name, tensor, role }: { name: string; tensor: SerializedTensor; role: 'input' | 'output' }) {
  const { data, dtype, shape } = tensor;
  const nameColor = role === 'output' ? 'var(--t-ok)' : 'var(--t-text3)';
  const nulled = data === null;

  const shapeStr = shape.length === 0 ? 'scalar'
    : `[${shape.map(d => d <= 0 ? 'N' : d).join(' × ')}]`;

  return (
    <div style={styles.tvRow}>
      <div style={styles.tvHeader}>
        <span style={{ ...styles.tvName, color: nameColor }}>{name}</span>
        <span style={styles.tvMeta}>{dtype} · {shapeStr}</span>
      </div>
      {nulled ? (
        <span style={styles.tvNull}>null — not produced</span>
      ) : (
        <ValueData data={data!} shape={shape} role={role} />
      )}
    </div>
  );
}

function ValueData({ data, shape, role }: { data: (number | string | boolean)[]; shape: number[]; role: 'input' | 'output' }) {
  const posColor = role === 'output' ? 'var(--t-ok)' : 'var(--t-accent2)';
  const negColor = 'var(--t-err)';

  if (data.length === 0) {
    return <span style={styles.tvEmpty}>[ ]</span>;
  }

  // Scalar or single value — show prominently
  if (data.length === 1) {
    const v = data[0];
    return (
      <span style={{ ...styles.tvBig, color: typeof v === 'number' && v < 0 ? negColor : posColor }}>
        {fmtVal(v)}
      </span>
    );
  }

  // 2-D — render as a small grid (cap at 4 rows × 8 cols)
  if (shape.length === 2) {
    const rows = Math.min(shape[0], 4);
    const cols = Math.min(shape[1], 8);
    const nc   = shape[1];
    return (
      <div style={styles.tvGrid}>
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const v = data[r * nc + c];
            return (
              <span key={`${r}-${c}`} style={{ ...styles.tvCell, color: typeof v === 'number' && v < 0 ? negColor : posColor }}>
                {fmtVal(v)}
              </span>
            );
          })
        )}
        {(shape[0] > 4 || shape[1] > 8) && (
          <span style={{ ...styles.tvCell, color: 'var(--t-muted)', gridColumn: '1/-1' }}>
            … {data.length} total
          </span>
        )}
      </div>
    );
  }

  // 1-D vector — show chips
  const show = data.slice(0, 12);
  return (
    <div style={styles.tvChips}>
      {show.map((v, i) => (
        <span key={i} style={{ ...styles.tvChip, color: typeof v === 'number' && v < 0 ? negColor : posColor }}>
          {fmtVal(v)}
        </span>
      ))}
      {data.length > 12 && (
        <span style={{ ...styles.tvChip, color: 'var(--t-muted)' }}>+{data.length - 12}</span>
      )}
    </div>
  );
}

// ── Body summaries (static) ───────────────────────────────────────────────────

function TreeSummary({ tree }: { tree: import('@openmle/omle.js').Tree }) {
  return (
    <SectionCard label="Tree">
      <PropGrid>
        <span style={styles.propKey}>Task</span>
        <span style={styles.propVal}>{tree.task_type ?? '—'}</span>
        <span style={styles.propKey}>Nodes</span>
        <span style={styles.propVal}>{tree.num_nodes ?? tree.node_kind?.length ?? 0}</span>
        <span style={styles.propKey}>Leaf vector</span>
        <span style={styles.propVal}>{tree.leaf_width ?? 1}</span>
      </PropGrid>
    </SectionCard>
  );
}

function EnsembleSummary({ ensemble }: { ensemble: import('@openmle/omle.js').TreeEnsemble }) {
  const totalNodes = ensemble.trees?.reduce((s, t) => s + (t.num_nodes ?? t.node_kind?.length ?? 0), 0) ?? 0;
  return (
    <SectionCard label="TreeEnsemble">
      <PropGrid>
        <span style={styles.propKey}>Task</span>
        <span style={styles.propVal}>{ensemble.task_type ?? '—'}</span>
        <span style={styles.propKey}>Trees</span>
        <span style={styles.propVal}>{ensemble.trees?.length ?? 0}</span>
        <span style={styles.propKey}>Total nodes</span>
        <span style={styles.propVal}>{totalNodes}</span>
        <span style={styles.propKey}>Aggregation</span>
        <span style={styles.propVal}>{ensemble.aggregation ?? 'SUM'}</span>
        <span style={styles.propKey}>Base score</span>
        <span style={styles.propVal}>{ensemble.base_score != null ? scalarToNumber(ensemble.base_score) : '—'}</span>
        <span style={styles.propKey}>Post-transform</span>
        <span style={styles.propVal}>{ensemble.post_transform ?? 'IDENTITY'}</span>
      </PropGrid>
    </SectionCard>
  );
}

function LinearSummary({ linear, onTensorClick }: { linear: import('@openmle/omle.js').Linear; onTensorClick: (id: string) => void }) {
  return (
    <SectionCard label="Linear">
      <PropGrid>
        <span style={styles.propKey}>Task</span>
        <span style={styles.propVal}>{linear.task_type ?? '—'}</span>
        <span style={styles.propKey}>Coefficients</span>
        <TensorValueCell tv={linear.coefficients} onTensorClick={onTensorClick} />
        <span style={styles.propKey}>Intercept</span>
        {linear.intercept
          ? <TensorValueCell tv={linear.intercept} onTensorClick={onTensorClick} />
          : <span style={styles.propVal}>—</span>}
        <span style={styles.propKey}>Post-transform</span>
        <span style={styles.propVal}>{linear.post_transform ?? 'IDENTITY'}</span>
      </PropGrid>
    </SectionCard>
  );
}

function InlineTensorCell({ tensor }: { tensor: import('@openmle/omle.js').Tensor }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <button style={styles.inlineTensorBtn} onClick={() => setExpanded(e => !e)}>
        <span style={styles.inlineTensorToggle}>{expanded ? '▾' : '▸'}</span>
        {`tensor:${tensorShape(tensor)}`}
      </button>
      {expanded && (
        <div style={styles.inlineTensorExpanded}>
          <JsonView value={tensor} inline />
        </div>
      )}
    </>
  );
}

// Dispatches on a TensorValue: link for tensor_ref, inline-expand for inline tensor.
function TensorValueCell({ tv, onTensorClick }: { tv: import('@openmle/omle.js').TensorValue; onTensorClick: (id: string) => void }) {
  if (tv.tensor_ref) return <TensorRefLink id={tv.tensor_ref.id} onClick={onTensorClick} />;
  if (tv.tensor)     return <InlineTensorCell tensor={tv.tensor} />;
  return <span style={styles.propVal}>—</span>;
}

function NNSummary({ nn, onTensorClick }: { nn: import('@openmle/omle.js').NeuralNetwork; onTensorClick: (id: string) => void }) {
  return (
    <SectionCard label="Neural Network">
      <PropGrid>
        <span style={styles.propKey}>Task</span>
        <span style={styles.propVal}>{nn.task_type ?? '—'}</span>
        <span style={styles.propKey}>Layers</span>
        <span style={styles.propVal}>{nn.layers?.length ?? 0}</span>
        {nn.layers?.map((layer, i) => (
          <React.Fragment key={i}>
            <span style={styles.layerIndex}>{i}</span>
            <span style={styles.layerVal}>
              <TensorValueCell tv={layer.weights} onTensorClick={onTensorClick} />
              <span style={styles.layerActivation}>{layer.activation}</span>
            </span>
          </React.Fragment>
        ))}
      </PropGrid>
    </SectionCard>
  );
}

function NBSummary({ nb, onTensorClick }: { nb: import('@openmle/omle.js').NaiveBayes; onTensorClick: (id: string) => void }) {
  const variant = nb.gaussian ? 'Gaussian' : nb.multinomial ? 'Multinomial' : nb.bernoulli ? 'Bernoulli' : nb.categorical ? 'Categorical' : '?';
  return (
    <SectionCard label="Naïve Bayes">
      <PropGrid>
        <span style={styles.propKey}>Variant</span>
        <span style={styles.propVal}>{variant}</span>
        <span style={styles.propKey}>Task</span>
        <span style={styles.propVal}>{nb.task_type ?? '—'}</span>
        <span style={styles.propKey}>Log priors</span>
        <TensorValueCell tv={nb.class_log_priors} onTensorClick={onTensorClick} />
      </PropGrid>
    </SectionCard>
  );
}

function ClusterSummary({ clustering, onTensorClick }: { clustering: import('@openmle/omle.js').Clustering; onTensorClick: (id: string) => void }) {
  const variant    = clustering.prototype ? 'Prototype' : clustering.gaussian_mixture ? 'Gaussian Mixture' : '?';
  const centersRef = clustering.prototype?.centers ?? clustering.gaussian_mixture?.means;
  return (
    <SectionCard label="Clustering">
      <PropGrid>
        <span style={styles.propKey}>Variant</span>
        <span style={styles.propVal}>{variant}</span>
        {clustering.prototype && <>
          <span style={styles.propKey}>Distance</span>
          <span style={styles.propVal}>{clustering.prototype.distance_measure ?? 'EUCLIDEAN'}</span>
        </>}
        {centersRef && <>
          <span style={styles.propKey}>Centers</span>
          <TensorValueCell tv={centersRef} onTensorClick={onTensorClick} />
        </>}
      </PropGrid>
    </SectionCard>
  );
}

function SVMSummary({ svm, onTensorClick }: { svm: import('@openmle/omle.js').SVM; onTensorClick: (id: string) => void }) {
  const variant = svm.linear ? 'Linear' : svm.kernel ? `Kernel (${svm.kernel.kernel_type ?? 'RBF'})` : '?';
  void onTensorClick;
  return (
    <SectionCard label="SVM">
      <PropGrid>
        <span style={styles.propKey}>Variant</span>
        <span style={styles.propVal}>{variant}</span>
        <span style={styles.propKey}>Task</span>
        <span style={styles.propVal}>{svm.task_type ?? '—'}</span>
        <span style={styles.propKey}>Post-transform</span>
        <span style={styles.propVal}>{svm.post_transform ?? 'IDENTITY'}</span>
      </PropGrid>
    </SectionCard>
  );
}


// ── Anomaly detection summary ─────────────────────────────────────────────────

function AnomalySummary({ ad, onTensorClick }: { ad: AnomalyDetection; onTensorClick: (id: string) => void }) {
  const variant = ad.isolation_forest ? 'IsolationForest'
    : ad.one_class_svm ? 'OneClassSVM'
    : ad.linear_one_class_svm ? 'LinearOneClassSVM'
    : ad.local_outlier_factor ? 'LocalOutlierFactor'
    : ad.elliptic_envelope ? 'EllipticEnvelope'
    : '—';

  return (
    <SectionCard label="AnomalyDetection">
      <PropGrid>
        <span style={styles.propKey}>Variant</span>
        <span style={styles.propVal}>{variant}</span>
        {ad.mode && ad.mode !== 'DETECTION_MODE_UNSPECIFIED' && <>
          <span style={styles.propKey}>Mode</span>
          <span style={styles.propVal}>{ad.mode}</span>
        </>}
        {ad.raw_score_polarity && ad.raw_score_polarity !== 'SCORE_POLARITY_UNSPECIFIED' && <>
          <span style={styles.propKey}>Score polarity</span>
          <span style={styles.propVal}>{ad.raw_score_polarity}</span>
        </>}
        {ad.threshold != null && <>
          <span style={styles.propKey}>Threshold</span>
          <span style={styles.propVal}>{scalarToNumber(ad.threshold)}</span>
        </>}
        {ad.isolation_forest && <>
          <span style={styles.propKey}>Trees</span>
          <span style={styles.propVal}>{ad.isolation_forest.trees?.length ?? 0}</span>
          <span style={styles.propKey}>Max samples</span>
          <span style={styles.propVal}>{ad.isolation_forest.max_samples ?? '—'}</span>
        </>}
        {ad.local_outlier_factor && <>
          <span style={styles.propKey}>n_neighbors</span>
          <span style={styles.propVal}>{ad.local_outlier_factor.n_neighbors ?? '—'}</span>
          <span style={styles.propKey}>Metric</span>
          <span style={styles.propVal}>{ad.local_outlier_factor.metric ?? '—'}</span>
        </>}
        {ad.linear_one_class_svm?.coefficients && <>
          <span style={styles.propKey}>Coefficients</span>
          <TensorValueCell tv={ad.linear_one_class_svm.coefficients} onTensorClick={onTensorClick} />
        </>}
        {ad.elliptic_envelope && <>
          {ad.elliptic_envelope.location && <>
            <span style={styles.propKey}>Location</span>
            <TensorValueCell tv={ad.elliptic_envelope.location} onTensorClick={onTensorClick} />
          </>}
          {ad.elliptic_envelope.covariance && <>
            <span style={styles.propKey}>Covariance</span>
            <TensorValueCell tv={ad.elliptic_envelope.covariance} onTensorClick={onTensorClick} />
          </>}
        </>}
      </PropGrid>
    </SectionCard>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function _IOList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div style={styles.ioLabel}>{label}</div>
      {items.map(name => (
        <div key={name} style={styles.ioItem}>
          <span style={styles.mono}>{name}</span>
        </div>
      ))}
      {items.length === 0 && <div style={styles.emptyHint}>none</div>}
    </div>
  );
}

function _TwoCol({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{left}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{right}</div>
    </div>
  );
}

function SectionCard({ label, children, noPad }: { label: string; children: React.ReactNode; noPad?: boolean }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardLabel}>{label}</div>
      <div style={noPad ? { margin: '0 -14px -12px' } : undefined}>{children}</div>
    </div>
  );
}

function PropGrid({ children }: { children: React.ReactNode }) {
  return <div style={styles.propGrid}>{children}</div>;
}

function TensorRefLink({ id, onClick }: { id: string; onClick: (id: string) => void }) {
  return (
    <span style={styles.tensorLink} onClick={() => onClick(id)} title={`Inspect tensor: ${id}`}>
      tensor:{id}
    </span>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div style={styles.tabBar}>
      {tabs.map(t => (
        <button
          key={t}
          style={{ ...styles.tab, ...(active === t ? styles.tabActive : {}) }}
          onClick={() => onChange(t)}
        >
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtVal(v: number | string | boolean): string {
  if (typeof v === 'string')  return `"${v}"`;
  if (typeof v === 'boolean') return String(v);
  if (isNaN(v))               return 'NaN';
  if (!isFinite(v))           return v > 0 ? '+∞' : '−∞';
  if (Number.isInteger(v))    return String(v);
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(3);
  return v.toPrecision(4).replace(/\.?0+$/, '');
}

function fmtMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function tensorShape(t: import('@openmle/omle.js').Tensor | import('@openmle/omle.js').SparseTensor): string {
  const shape = t.type?.shape ?? [];
  const dtype = t.type?.dtype?.replace('DATA_TYPE_UNSPECIFIED', '') ?? '';
  const dims = shape.map((d: number) => d <= 0 ? 'N' : String(d)).join('×');
  return dims ? `${dtype}[${dims}]` : dtype || '…';
}

function formatExpr(expr: Expression): string {
  if (expr.literal != null) {
    const s = expr.literal;
    if (s.double_value !== undefined) return String(s.double_value);
    if (s.float_value !== undefined) return String(s.float_value);
    if (s.int_value !== undefined) return String(s.int_value);
    if (s.bool_value !== undefined) return String(s.bool_value);
    if (s.string_value !== undefined) return `"${s.string_value}"`;
    return '?';
  }
  if (expr.ref != null) {
    const name = expr.ref.value ?? '?';
    return expr.ref.field ? `${name}.${expr.ref.field}` : name;
  }
  if (expr.apply != null) {
    const fn = expr.apply.function ?? '';
    const baseName = fn.split('.').pop()?.toLowerCase() ?? fn;
    const args = expr.apply.arguments ?? [];
    const fmtArgs = args.map(formatExpr);
    if (args.length === 2) {
      const [a, b] = fmtArgs;
      switch (baseName) {
        case 'add': case 'plus':                    return `(${a} + ${b})`;
        case 'subtract': case 'sub': case 'minus':  return `(${a} - ${b})`;
        case 'multiply': case 'mul':                return `(${a} * ${b})`;
        case 'divide': case 'div':                  return `(${a} / ${b})`;
        case 'pow': case 'power':                   return `(${a} ** ${b})`;
        case 'mod':                                 return `(${a} % ${b})`;
        case 'and':                                 return `(${a} && ${b})`;
        case 'or':                                  return `(${a} || ${b})`;
        case 'lt': case 'less_than':                return `(${a} < ${b})`;
        case 'le': case 'less_or_equal':            return `(${a} <= ${b})`;
        case 'gt': case 'greater_than':             return `(${a} > ${b})`;
        case 'ge': case 'greater_or_equal':         return `(${a} >= ${b})`;
        case 'eq': case 'equal':                    return `(${a} == ${b})`;
        case 'ne': case 'not_equal':                return `(${a} != ${b})`;
      }
    }
    if (args.length === 1) {
      const [a] = fmtArgs;
      if (baseName === 'neg' || baseName === 'negate') return `(-${a})`;
      if (baseName === 'not')  return `(!${a})`;
      if (baseName === 'abs')  return `|${a}|`;
    }
    return `${baseName}(${fmtArgs.join(', ')})`;
  }
  return '?';
}

function attrValue(attr: import('@openmle/omle.js').Attribute): string {
  if (attr.i !== undefined) return String(attr.i);
  if (attr.f32 !== undefined) return String(attr.f32);
  if (attr.f64 !== undefined) return String(attr.f64);
  if (attr.s !== undefined) return `"${attr.s}"`;
  if (attr.b !== undefined) return String(attr.b);
  if (attr.ints)     return `[${attr.ints.join(', ')}]`;
  if (attr.float32s) return `[${attr.float32s.join(', ')}]`;
  if (attr.float64s) return `[${attr.float64s.join(', ')}]`;
  if (attr.strings)  return `[${attr.strings.join(', ')}]`;
  if (attr.tensor_ref) return `tensor:${attr.tensor_ref.id}`;
  if (attr.tensor)  return `tensor:${tensorShape(attr.tensor)}`;
  if (attr.sparse)  return `sparse:${tensorShape(attr.sparse)}`;
  if (attr.expr)    return formatExpr(attr.expr);
  return '—';
}

function getBodyType(node: Node): string | undefined {
  if (node.tree)          return 'Tree';
  if (node.tree_ensemble) return 'TreeEnsemble';
  if (node.linear)        return 'Linear';
  if (node.neural_network) return 'NeuralNetwork';
  if (node.naive_bayes)   return 'NaiveBayes';
  if (node.clustering)    return 'Clustering';
  if (node.svm)           return 'SVM';
  if (node.anomaly_detection)  return 'AnomalyDetection';
  if (node.composite)          return 'Composite';
  return node.op ?? undefined;
}

function nodeIcon(node: Node): React.ReactNode {
  if (node.tree_ensemble) return <TreeEnsembleIconHtml size={18} />;
  if (node.tree)          return '🌳';
  if (node.linear)                      return 'Σ';
  if (node.svm)                         return '⊗';
  if (node.neural_network)             return <NeuralNetworkIconHtml size={18} />;
  if (node.naive_bayes)                return '🎲';
  if (node.clustering)                 return '🔵';
  if (node.anomaly_detection)          return '🔍';
  if (node.composite)                  return '📦';
  return '⚙';
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  titleRow: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '14px 20px 10px', borderBottom: '1px solid var(--t-border)', flexShrink: 0,
  },
  titleFirstLine: { display: 'flex', alignItems: 'center', gap: 8 },
  titleBadges: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, paddingLeft: 2 },
  titleIcon: { fontSize: 18, flexShrink: 0 },
  titleName: { fontSize: 14, fontWeight: 700, color: 'var(--t-text)', fontFamily: 'monospace', wordBreak: 'break-all' as const },
  bodyBadge: { fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)', borderRadius: 10, padding: '2px 8px', color: 'var(--t-accent)', flexShrink: 0 },
  domainBadge: { fontSize: 10, background: 'var(--t-chip)', border: '1px solid var(--t-frame)', borderRadius: 10, padding: '2px 8px', color: 'var(--t-text3)', flexShrink: 0 },

  tabBar: { display: 'flex', gap: 2, padding: '6px 16px 0', flexShrink: 0 },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', color: 'var(--t-text4)', fontSize: 12, padding: '4px 10px 4px', fontWeight: 500 },
  tabActive: { color: 'var(--t-accent2)', borderBottom: '2px solid var(--t-accent)' },

  content: { flex: 1, overflowY: 'auto', padding: 16, borderTop: '1px solid var(--t-border)' },

  card: { background: 'var(--t-surface)', border: '1px solid var(--t-frame)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 },
  cardLabel: { fontSize: 11, fontWeight: 600, color: 'var(--t-text4)', marginBottom: 8 },

  propGrid: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', fontSize: 12 },
  propKey: { color: 'var(--t-accent)' },
  propVal: { color: 'var(--t-text2)', fontFamily: 'monospace', fontSize: 11 },

  ioRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--t-line)', fontSize: 12 },
  ioArrow: { fontSize: 10, color: 'var(--t-text4)', flexShrink: 0, width: 12 },
  ioName: { fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ioType: { fontFamily: 'monospace', fontSize: 10, color: 'var(--t-muted)', flexShrink: 0 },
  ioRole: { fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--t-chip)', border: '1px solid var(--t-frame)', color: 'var(--t-accent)', flexShrink: 0 },
  mono: { fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text2)' },

  layerIndex: { color: 'var(--t-text4)' },
  layerVal: { display: 'flex', gap: 8, alignItems: 'center' },
  layerActivation: { color: 'var(--t-ok)', fontSize: 11, fontFamily: 'monospace' },
  tensorLink: { background: 'none', border: 'none', padding: 0, color: 'var(--t-accent)', fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--t-muted)' },
  inlineTensorBtn: {
    display: 'flex', alignItems: 'center', gap: 3,
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: 'var(--t-accent)', fontFamily: 'monospace', fontSize: 11, textAlign: 'left' as const,
  },
  inlineTensorToggle: { fontSize: 9, color: 'var(--t-text4)', flexShrink: 0 },
  inlineTensorExpanded: {
    gridColumn: 'span 2',
    margin: '4px 0 8px',
    padding: '8px 10px',
    background: 'var(--t-canvas)',
    border: '1px solid var(--t-frame)',
    borderRadius: 6,
    overflowX: 'auto',
    maxHeight: 260,
    overflowY: 'auto',
  },

  // Execution tab
  execMeta: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  timing: { fontSize: 12, color: 'var(--t-accent)', fontFamily: 'monospace', background: 'var(--t-chip)', border: '1px solid var(--t-frame)', borderRadius: 6, padding: '3px 10px' },
  warnBadge: { fontSize: 11, color: 'var(--t-warn)', background: 'var(--t-warn-bg)', border: '1px solid var(--t-node-warn-b)', borderRadius: 6, padding: '3px 10px' },
  warnRow: { fontSize: 12, color: 'var(--t-warn)', padding: '3px 0', borderBottom: '1px solid var(--t-node-warn)' },

  // Tensor value display
  tvRow: { marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--t-line)' },
  tvHeader: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  tvName: { fontFamily: 'monospace', fontSize: 12, fontWeight: 600 },
  tvMeta: { fontSize: 10, color: 'var(--t-muted)' },
  tvNull: { fontSize: 11, color: 'var(--t-err)', fontStyle: 'italic' },
  tvEmpty: { fontSize: 11, color: 'var(--t-muted)', fontFamily: 'monospace' },
  tvBig: { fontFamily: 'monospace', fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' },
  tvGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 2 },
  tvCell: { fontFamily: 'monospace', fontSize: 10, padding: '2px 4px', background: 'var(--t-surface)', borderRadius: 3, textAlign: 'right' },
  tvChips: { display: 'flex', flexWrap: 'wrap', gap: 3 },
  tvChip: { fontFamily: 'monospace', fontSize: 10, padding: '2px 6px', background: 'var(--t-surface)', borderRadius: 4 },
};
