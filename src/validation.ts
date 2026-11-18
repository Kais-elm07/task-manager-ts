import { ValidationError } from './errors.js';

/**
 * Input checks shared by the services. They take `unknown` because input may come from
 * an untyped source (JSON, a form, another program), where TypeScript types do not exist.
 */

/** Returns the trimmed text, or throws if it is missing, blank or too long. */
export function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} is required`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return text;
}

/** Like `requireText`, but `undefined` or blank text means "no value" and returns `undefined`. */
export function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be text`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return text === '' ? undefined : text;
}

/** Returns `value` narrowed to one of `allowed`, or throws. */
export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const match = allowed.find((option) => option === value);
  if (match === undefined) {
    throw new ValidationError(
      `${field} must be one of: ${allowed.join(', ')} (received ${JSON.stringify(value) ?? 'undefined'})`,
    );
  }
  return match;
}
