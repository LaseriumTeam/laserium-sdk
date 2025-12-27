import { LaseriumError } from '../errors/LaseriumError.js';

export type RoundingMode = 'down' | 'up';

export function toBigIntAmount(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new LaseriumError('InvalidArgument', 'Amount must be a non-negative integer');
    }
    return BigInt(value);
  }
  if (!/^[0-9]+$/.test(value)) {
    throw new LaseriumError('InvalidArgument', 'Amount string must be base-10 integer');
  }
  return BigInt(value);
}

export function pow10(exp: number): bigint {
  if (!Number.isInteger(exp) || exp < 0) {
    throw new LaseriumError('InvalidArgument', 'pow10 exponent must be a non-negative integer');
  }
  let result = 1n;
  for (let i = 0; i < exp; i++) result *= 10n;
  return result;
}

export function mulDiv(
  a: bigint,
  b: bigint,
  denom: bigint,
  rounding: RoundingMode = 'down'
): bigint {
  if (denom === 0n) throw new LaseriumError('InvalidArgument', 'Division by zero');
  const product = a * b;
  if (rounding === 'down') return product / denom;
  const q = product / denom;
  const r = product % denom;
  return r === 0n ? q : q + 1n;
}

export function clampBps(bps: number): number {
  if (!Number.isFinite(bps) || bps < 0 || bps > 10_000) {
    throw new LaseriumError('InvalidArgument', 'bps must be in [0, 10000]');
  }
  return bps;
}

export function applyBps(amount: bigint, bps: number, rounding: RoundingMode = 'down'): bigint {
  const safeBps = clampBps(bps);
  return mulDiv(amount, BigInt(10_000 - safeBps), 10_000n, rounding);
}

export function bpsOf(amount: bigint, bps: number, rounding: RoundingMode = 'down'): bigint {
  const safeBps = clampBps(bps);
  return mulDiv(amount, BigInt(safeBps), 10_000n, rounding);
}

export function absBigInt(x: bigint): bigint {
  return x < 0n ? -x : x;
}
