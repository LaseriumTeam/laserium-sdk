import type { PublicKey } from '@solana/web3.js';

export type SwapQuote = {
  fromMint: PublicKey;
  toMint: PublicKey;

  inAmount: bigint;
  outAmount: bigint;

  /**
   * Quote price expressed as (to / from) with fixed-point exponent `priceExpo`.
   * Meaning: outAmount ≈ inAmount * price * 10^priceExpo.
   */
  price: bigint;
  priceExpo: number;

  feeBps: number;
  spreadBps: number;

  oracle: {
    kind: 'pyth' | 'switchboard';
    feed: PublicKey;
    publishTime: number;
    conf: bigint;
    expo: number;
  };

  /**
   * Deterministic min output enforcing slippage before execution.
   */
  minOutAmount: bigint;
};
