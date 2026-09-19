// Protobuf binary loader for .omle files.
//
// The proto format differs from JSON in one key way: repeated typed arrays
// are wrapped in list messages (e.g. Float32List { repeated float values = 1; }).
// This module decodes the binary, flattens those wrappers, and returns an
// OMLEModel identical to what fromJSON produces.

import * as protobuf from 'protobufjs';
import protoSource from '../../omle/protobuf/omle.proto?raw';
import { fromJSON } from '@openmle/omle.js';
import type { OMLEModel } from '@openmle/omle.js';

let _root: protobuf.Root | null = null;

function getRoot(): protobuf.Root {
  if (!_root) {
    _root = protobuf.parse(protoSource, { keepCase: true }).root;
  }
  return _root;
}

export function loadProtoBinary(buffer: ArrayBuffer): OMLEModel {
  const root = getRoot();
  const ModelType = root.lookupType('omle.v1.OMLEModel');
  const decoded = ModelType.decode(new Uint8Array(buffer));
  const obj = ModelType.toObject(decoded, {
    longs: Number,
    enums: String,
    bytes: String,  // base64 — matches JSON convention
    defaults: false,
  });
  const ir = flattenListWrappers(obj) as object;
  return fromJSON(ir);
}

// Recursively flatten { values: [...] } objects produced by the
// Float32List / Float64List / Int32List / etc. wrapper messages.
// Those messages have exactly one field named 'values', so the
// heuristic is unambiguous.
function flattenListWrappers(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(flattenListWrappers);

  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 1 && keys[0] === 'values' && Array.isArray(obj['values'])) {
    const arr = obj['values'] as unknown[];
    // Only collapse scalar list-wrappers (Float32List, Int32List, etc.).
    // Object arrays like DiscreteDomain.values contain DomainValue messages — keep them structured,
    // or Array.prototype.values would shadow the field and crash callers that do .slice()/.map().
    if (arr.every(item => item === null || typeof item !== 'object')) {
      return arr.map(flattenListWrappers);
    }
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = flattenListWrappers(v);
  }
  return result;
}
