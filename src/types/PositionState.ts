import type { PublicKey } from '@solana/web3.js';

export type PositionState = {
  positionId: PublicKey;
  vaultId: PublicKey;
  owner: PublicKey;

  shares: bigint;
  lastUpdatedTs?: number;
};
