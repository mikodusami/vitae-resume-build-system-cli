/**
 * Result — an expected-failure return value.
 *
 * Domain operations report failure by returning `err(...)` rather than
 * throwing: an unknown project ID or an undefendable claim is an ordinary
 * outcome the CLI must be able to collect several of and report together.
 * `throw` stays reserved for genuine programmer bugs.
 */

/** A successful outcome carrying a value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed outcome carrying an error describing why. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Either a success carrying `T` or a failure carrying `E`. */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Wraps a value as a successful result.
 *
 * @param value - the value to carry
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Wraps an error as a failed result.
 *
 * @param error - the error to carry
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Narrows a result to its success branch. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Narrows a result to its failure branch. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Transforms the value of a successful result, passing failures through.
 *
 * @param result - the result to transform
 * @param fn - mapping applied only on success
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Chains a fallible operation onto a successful result.
 *
 * @param result - the result to chain from
 * @param fn - operation applied only on success
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Returns the carried value, or `fallback` when the result is a failure.
 *
 * @param result - the result to read
 * @param fallback - value returned on failure
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Collects results, accumulating every error rather than stopping at the first.
 *
 * Accumulation is the point: a variant referencing three unknown projects
 * should report three errors in one run, not force three build attempts.
 *
 * @param results - results to collect, in order
 */
export function collect<T, E>(results: readonly Result<T, E>[]): Result<T[], E[]> {
  const values: T[] = [];
  const errors: E[] = [];

  for (const result of results) {
    if (result.ok) {
      values.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  return errors.length > 0 ? err(errors) : ok(values);
}
