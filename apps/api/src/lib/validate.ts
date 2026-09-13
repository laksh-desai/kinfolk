import type { ZodTypeAny, z } from 'zod';
import { ValidationError } from './errors';

/** Parses with the same shared Zod schema the web form uses, mapping issues to field messages. */
export function parseInput<S extends ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data as z.output<S>;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    fields[key] ??= issue.message;
  }
  const count = Object.keys(fields).length;
  const message =
    count === 1 ? 'One field needs attention.' : `${count} fields need attention.`;
  throw new ValidationError(message, fields);
}
