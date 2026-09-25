// Minimal JSON-schema validation shared by tools and enterprise systems.
// (types, enums, required, bounds, no extra props).
export function validate(schema, input, path = 'input') {
  const errs = [];
  if (schema.type === 'object') {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return [`${path} must be an object`];
    for (const r of schema.required || []) if (input[r] === undefined || input[r] === null || input[r] === '') errs.push(`${path}.${r} is required`);
    if (schema.properties) {
      for (const [k, v] of Object.entries(input)) {
        const ps = schema.properties[k];
        if (!ps) { if (schema.additionalProperties === false) errs.push(`${path}.${k} is not allowed`); continue; }
        if (v === undefined || v === null) continue;
        errs.push(...validate(ps, v, `${path}.${k}`));
      }
    }
  } else if (schema.type === 'string') {
    if (typeof input !== 'string') errs.push(`${path} must be a string`);
    else if (schema.enum && !schema.enum.includes(input)) errs.push(`${path} must be one of ${schema.enum.join(',')}`);
    else if (input.length > (schema.maxLength ?? 200000)) errs.push(`${path} too long`);
    else if (schema.minLength && input.trim().length < schema.minLength) errs.push(`${path} is too short`);
    else if (schema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(input)) errs.push(`${path} must be YYYY-MM-DD`);
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(input)) errs.push(`${path} must be an integer`);
    else if ((schema.minimum != null && input < schema.minimum) || (schema.maximum != null && input > schema.maximum)) errs.push(`${path} out of range`);
  } else if (schema.type === 'number') {
    if (typeof input !== 'number' || !Number.isFinite(input)) errs.push(`${path} must be a number`);
    else if ((schema.minimum != null && input < schema.minimum) || (schema.maximum != null && input > schema.maximum)) errs.push(`${path} out of range`);
  } else if (schema.type === 'boolean') {
    if (typeof input !== 'boolean') errs.push(`${path} must be a boolean`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(input)) errs.push(`${path} must be an array`);
    else if (schema.maxItems != null && input.length > schema.maxItems) errs.push(`${path} has too many items`);
    else if (schema.items) input.forEach((x, i) => errs.push(...validate(schema.items, x, `${path}[${i}]`)));
  }
  return errs;
}
