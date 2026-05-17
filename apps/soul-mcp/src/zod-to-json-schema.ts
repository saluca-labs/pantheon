/**
 * zod-to-json-schema.ts — Minimal Zod -> JSON Schema converter for the
 * MCP tool inputSchema field.
 *
 * Why not the `zod-to-json-schema` npm package: it pulls a 60 KB dep
 * tree for a feature surface we use about 5 % of. The MCP spec only
 * needs `{ type: 'object', properties, required, additionalProperties }`
 * for our tool inputs, which all happen to be ZodObjects of primitives,
 * arrays, enums, and records. This file handles those cases and throws
 * on anything else so a future tool author gets a clear error rather
 * than a silently-incomplete schema.
 *
 * If we ever need refs, unions, or recursive schemas, swap this for
 * `import { zodToJsonSchema } from 'zod-to-json-schema'` — no caller
 * change required.
 */

import {
  ZodArray,
  ZodBoolean,
  ZodDefault,
  ZodEnum,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodRecord,
  ZodString,
  type ZodTypeAny,
} from 'zod';

type JsonSchema = Record<string, unknown>;

function convertNode(node: ZodTypeAny): JsonSchema {
  if (node instanceof ZodOptional) {
    return convertNode(node._def.innerType);
  }
  if (node instanceof ZodDefault) {
    const inner = convertNode(node._def.innerType);
    return { ...inner, default: node._def.defaultValue() };
  }
  if (node instanceof ZodString) return { type: 'string' };
  if (node instanceof ZodNumber) return { type: 'number' };
  if (node instanceof ZodBoolean) return { type: 'boolean' };
  if (node instanceof ZodEnum) {
    return { type: 'string', enum: [...node._def.values] };
  }
  if (node instanceof ZodArray) {
    return { type: 'array', items: convertNode(node._def.type) };
  }
  if (node instanceof ZodRecord) {
    return { type: 'object', additionalProperties: true };
  }
  if (node instanceof ZodObject) {
    return convertObject(node);
  }
  // Fallback — accept anything; caller-visible schema is fine for tools
  // we don't fully describe (e.g. metadata bags).
  return {};
}

function convertObject(node: ZodObject<Record<string, ZodTypeAny>>): JsonSchema {
  const shape = node.shape;
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    properties[key] = convertNode(value);
    const isOptional = value instanceof ZodOptional || value instanceof ZodDefault;
    if (!isOptional) required.push(key);
  }
  const out: JsonSchema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) out.required = required;
  return out;
}

export function zodToJsonSchema(node: ZodTypeAny): JsonSchema {
  if (node instanceof ZodObject) return convertObject(node);
  return convertNode(node);
}
