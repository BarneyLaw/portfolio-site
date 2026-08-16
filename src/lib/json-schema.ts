// ── Minimal JSON Schema validator ────────────────────────────────────────
// Just enough of draft 2020-12 to check the content registry against the
// backend's own schema file, which is vendored at
// schema/content-registry.schema.json.
//
// Why not a schema library: this runs at build time only, and the alternative
// to ~90 lines here is a dependency whose whole surface we would use one
// percent of. What matters is that the *schema* stays the declarative source —
// this interprets that file rather than restating its rules in code, so a
// backend schema change is a file copy, not a rewrite.
//
// Supported: $ref/$defs, type, const, enum, pattern, maxLength, minItems,
// maxItems, required, properties, additionalProperties:false, items.
// Anything else in a schema is ignored, which is why validateAgainstSchema is
// a *guard* against an obviously wrong manifest, not a substitute for the
// backend's own strict validation. The sync command validates again and
// refuses the deployment; this just fails the build first, where it is cheap.

export type JsonSchema = Record<string, unknown>;

/** A human-readable path like `items[3].slug`, for error messages. */
type Path = string;

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function resolve(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  if (!ref.startsWith("#/")) {
    throw new Error(`unsupported $ref: ${ref} (only local #/... refs are handled)`);
  }
  let target: unknown = root;
  for (const segment of ref.slice(2).split("/")) {
    target = (target as Record<string, unknown>)?.[segment];
  }
  if (!target || typeof target !== "object") throw new Error(`unresolvable $ref: ${ref}`);
  return target as JsonSchema;
}

function check(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: Path,
  errors: string[],
): void {
  const node = resolve(schema, root);

  if ("const" in node && value !== node.const) {
    errors.push(`${path}: expected ${JSON.stringify(node.const)}, got ${JSON.stringify(value)}`);
    return;
  }

  if (Array.isArray(node.enum) && !node.enum.includes(value as never)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(node.enum)}`);
    return;
  }

  if (typeof node.type === "string") {
    const actual = typeOf(value);
    // JSON has one number type; "integer" is a refinement of it.
    const ok = node.type === "number" ? actual === "integer" || actual === "number" : actual === node.type;
    if (!ok) {
      errors.push(`${path}: expected type ${node.type}, got ${actual}`);
      return;
    }
  }

  if (typeof value === "string") {
    if (typeof node.pattern === "string" && !new RegExp(node.pattern).test(value)) {
      errors.push(`${path}: ${JSON.stringify(value)} does not match /${node.pattern}/`);
    }
    if (typeof node.maxLength === "number" && value.length > node.maxLength) {
      errors.push(`${path}: longer than maxLength ${node.maxLength}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof node.minItems === "number" && value.length < node.minItems) {
      errors.push(`${path}: has ${value.length} items, minimum ${node.minItems}`);
    }
    if (typeof node.maxItems === "number" && value.length > node.maxItems) {
      errors.push(`${path}: has ${value.length} items, maximum ${node.maxItems}`);
    }
    if (node.items && typeof node.items === "object") {
      value.forEach((item, index) =>
        check(item, node.items as JsonSchema, root, `${path}[${index}]`, errors),
      );
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const properties = (node.properties ?? {}) as Record<string, JsonSchema>;

    for (const key of (node.required as string[] | undefined) ?? []) {
      if (!(key in object)) errors.push(`${path}: missing required property "${key}"`);
    }

    if (node.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!(key in properties)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }

    for (const [key, sub] of Object.entries(properties)) {
      if (key in object) check(object[key], sub, root, path ? `${path}.${key}` : key, errors);
    }
  }
}

/** Returns every violation. An empty array means the value satisfies the schema. */
export function validateAgainstSchema(value: unknown, schema: JsonSchema): string[] {
  const errors: string[] = [];
  check(value, schema, schema, "", errors);
  return errors;
}
