import type { PublicKey } from '@solana/web3.js';

export type VaultState = {
  vaultId: PublicKey;
  assetMint: PublicKey;

  totalAssets: bigint;
  totalShares: bigint;

  capacityAssets?: bigint;
  utilizationBps?: number;

  lastUpdatedTs?: number;
};
