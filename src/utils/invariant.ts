import { LaseriumError } from '../errors/LaseriumError.js';

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new LaseriumError('InvariantViolation', message);
  }
}

export function assertNonNull<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new LaseriumError('InvariantViolation', message);
  }
  return value;
}
