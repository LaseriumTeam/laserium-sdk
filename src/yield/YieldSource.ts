import type { PublicKey } from '@solana/web3.js';
import type { YieldSourceMetrics } from '../types/YieldState.js';

export interface YieldSource {
  readonly id: string;

  /**
   * Returns live metrics for routing decisions.
   * Implementations should be backed by on-chain state or verifiable data.
   */
  getMetrics(assetMint: PublicKey): Promise<YieldSourceMetrics>;
}
