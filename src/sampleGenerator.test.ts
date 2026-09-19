// Unit tests for sampleGenerator.ts — sample input generation from model schema.

import { describe, test, expect } from 'vitest';
import { generateSampleInput } from './sampleGenerator.js';
import type { OMLEModel } from '@openmle/omle.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function parse(model: Parameters<typeof generateSampleInput>[0]): Record<string, unknown> {
  return JSON.parse(generateSampleInput(model));
}

// ── generateSampleInput ───────────────────────────────────────────────────────

describe('generateSampleInput', () => {
  test('empty model returns empty object', () => {
    expect(parse({})).toEqual({});
  });

  test('model with no inputs uses schema features as top-level keys', () => {
    const model: OMLEModel = {
      model_schema: {
        features: [
          { name: 'age', type: { dtype: 'FLOAT32', shape: [] } },
          { name: 'income', type: { dtype: 'FLOAT32', shape: [] } },
        ],
      },
    };
    const result = parse(model);
    expect(Object.keys(result)).toContain('age');
    expect(Object.keys(result)).toContain('income');
  });

  test('model with declared input and shape generates array', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'x', type: { dtype: 'FLOAT32', shape: [4] } }],
    };
    const result = parse(model);
    expect(Array.isArray(result['x'])).toBe(true);
    expect((result['x'] as unknown[]).length).toBe(4);
  });

  test('scalar input (empty shape) generates a scalar', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'flag', type: { dtype: 'FLOAT32', shape: [] } }],
    };
    const result = parse(model);
    expect(typeof result['flag']).toBe('number');
  });

  test('2D shape generates nested array', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'mat', type: { dtype: 'FLOAT32', shape: [2, 3] } }],
    };
    const result = parse(model);
    const mat = result['mat'] as unknown[][];
    expect(Array.isArray(mat)).toBe(true);
    expect(mat.length).toBe(2);
    expect(mat[0].length).toBe(3);
  });

  test('dynamic batch dimension (-1) is treated as 1', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'x', type: { dtype: 'FLOAT32', shape: [-1, 4] } }],
    };
    const result = parse(model);
    const rows = result['x'] as unknown[][];
    expect(rows.length).toBe(1);
    expect(rows[0].length).toBe(4);
  });

  test('STRING dtype produces string values', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'text', type: { dtype: 'STRING', shape: [1] } }],
    };
    const result = parse(model);
    const arr = result['text'] as string[];
    expect(typeof arr[0]).toBe('string');
  });

  test('BOOL dtype produces boolean values', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'flag', type: { dtype: 'BOOL', shape: [] } }],
    };
    const result = parse(model);
    expect(typeof result['flag']).toBe('boolean');
  });

  test('INT dtype produces integer values', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'count', type: { dtype: 'INT64', shape: [] } }],
    };
    const result = parse(model);
    expect(Number.isInteger(result['count'])).toBe(true);
  });

  test('discrete domain picks a valid value', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'cat', type: { dtype: 'FLOAT32', shape: [] } }],
      model_schema: {
        features: [
          {
            name: 'cat',
            type: { dtype: 'FLOAT32', shape: [] },
            domain: {
              discrete: {
                values: [
                  { value: { double_value: 1.0 } },
                  { value: { double_value: 2.0 } },
                  { value: { double_value: 3.0 } },
                ],
              },
            },
          },
        ],
      },
    };
    const result = parse(model);
    expect([1, 2, 3]).toContain(result['cat']);
  });

  test('continuous interval generates value in range', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'temp', type: { dtype: 'FLOAT32', shape: [] } }],
      model_schema: {
        features: [
          {
            name: 'temp',
            type: { dtype: 'FLOAT32', shape: [] },
            domain: {
              continuous: {
                intervals: [
                  {
                    left_margin: { double_value: 5.0 },
                    right_margin: { double_value: 7.0 },
                    closure: 'CLOSED_CLOSED',
                  },
                ],
              },
            },
          },
        ],
      },
    };
    // Run a few times to confirm the value is always in [5, 7]. The range is
    // deliberately not [0, 1] — those are the fallbacks used when the margins
    // cannot be read, so this would pass even if they were ignored.
    for (let i = 0; i < 10; i++) {
      const result = parse(model);
      const val = result['temp'] as number;
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(7);
    }
  });

  test('string discrete domain picks a valid string', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'color', type: { dtype: 'STRING', shape: [] } }],
      model_schema: {
        features: [
          {
            name: 'color',
            type: { dtype: 'STRING', shape: [] },
            domain: {
              discrete: {
                values: [
                  { value: { string_value: 'red' } },
                  { value: { string_value: 'blue' } },
                ],
              },
            },
          },
        ],
      },
    };
    const result = parse(model);
    expect(['red', 'blue']).toContain(result['color']);
  });

  test('range features expand to individual columns (no declared inputs)', () => {
    const model: OMLEModel = {
      model_schema: {
        features: [
          { range: { prefix: 'f_', start: 0, end: 3 }, type: { dtype: 'FLOAT32', shape: [] } },
        ],
      },
    };
    const result = parse(model);
    expect(Object.keys(result)).toEqual(expect.arrayContaining(['f_0', 'f_1', 'f_2']));
  });

  test('result is valid JSON', () => {
    const model: OMLEModel = {
      inputs: [{ name: 'x', type: { dtype: 'FLOAT32', shape: [3] } }],
    };
    // generateSampleInput returns a JSON string
    const str = generateSampleInput(model);
    expect(() => JSON.parse(str)).not.toThrow();
  });

  test('multiple inputs each get their own key', () => {
    const model: OMLEModel = {
      inputs: [
        { name: 'a', type: { dtype: 'FLOAT32', shape: [2] } },
        { name: 'b', type: { dtype: 'FLOAT32', shape: [3] } },
      ],
    };
    const result = parse(model);
    expect(Object.keys(result)).toContain('a');
    expect(Object.keys(result)).toContain('b');
    expect((result['a'] as unknown[]).length).toBe(2);
    expect((result['b'] as unknown[]).length).toBe(3);
  });
});
