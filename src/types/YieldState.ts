import type { PublicKey } from '@solana/web3.js';

export type YieldSourceId = string;

export type YieldSourceMetrics = {
  sourceId: YieldSourceId;
  aprBps: number;
  liquidityUsd: number;
  riskScore: number;
  updatedAt: number;
};

export type YieldState = {
  vaultId: PublicKey;
  allocations: Array<{ sourceId: YieldSourceId; weightBps: number }>;
  updatedAt: number;
};
