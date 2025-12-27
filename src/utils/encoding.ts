import { PublicKey } from '@solana/web3.js';
import { LaseriumError } from '../errors/LaseriumError.js';

export function asPublicKey(value: PublicKey | string, fieldName = 'publicKey'): PublicKey {
  if (value instanceof PublicKey) return value;
  try {
    return new PublicKey(value);
  } catch (cause) {
    throw new LaseriumError('InvalidArgument', `Invalid ${fieldName}`, { cause, details: { value } });
  }
}

export function utf8Bytes(text: string): Buffer {
  return Buffer.from(text, 'utf8');
}
