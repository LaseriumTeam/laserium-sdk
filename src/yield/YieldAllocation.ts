import type { YieldSourceMetrics } from '../types/YieldState.js';

export type YieldAllocation = {
  sourceId: string;
  weightBps: number;
  metrics: YieldSourceMetrics;
};
