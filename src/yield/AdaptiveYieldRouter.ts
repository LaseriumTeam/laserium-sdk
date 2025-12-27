import type { PublicKey } from '@solana/web3.js';
import { Transaction } from '@solana/web3.js';
import type { LaseriumReadonlyClient } from '../client/LaseriumReadonlyClient.js';
import type { LaseriumClient } from '../client/LaseriumClient.js';
import { LaseriumError } from '../errors/LaseriumError.js';
import type { YieldAllocation } from './YieldAllocation.js';
import type { YieldSource } from './YieldSource.js';
import { YieldRebalance } from './YieldRebalance.js';
import { PDA } from '../accounts/PDA.js';

export type YieldRouterConfig = {
  sources: YieldSource[];

  /**
   * Weighting parameters.
   */
  riskPenaltyBpsPerPoint: number;
  minLiquidityUsd: number;

  /**
   * If provided, do not allocate more than this to any single source.
   */
  maxSingleSourceBps?: number;

  /** Optional protocol-specific decoder for on-chain yield breakdown. */
  decodeYieldState?: (rawYieldRouterAccount: unknown, vaultId: PublicKey) => unknown;
};

export class AdaptiveYieldRouter {
  private config?: YieldRouterConfig;

  constructor(readonly client: LaseriumReadonlyClient) {}

  configure(config: YieldRouterConfig): void {
    if (config.sources.length === 0) {
      throw new LaseriumError('InvalidArgument', 'Yield router requires at least one source');
    }
    if (config.riskPenaltyBpsPerPoint < 0) {
      throw new LaseriumError('InvalidArgument', 'riskPenaltyBpsPerPoint must be >= 0');
    }
    if (config.minLiquidityUsd < 0) {
      throw new LaseriumError('InvalidArgument', 'minLiquidityUsd must be >= 0');
    }
    this.config = config;
  }

  async getOptimalYieldRoute(assetMint: PublicKey): Promise<YieldAllocation[]> {
    if (!this.config) {
      throw new LaseriumError('ProgramNotConfigured', 'Yield router not configured; call configure()');
    }

    const metrics = await Promise.all(this.config.sources.map((s) => s.getMetrics(assetMint)));

    const eligible = metrics
      .filter((m) => m.liquidityUsd >= this.config!.minLiquidityUsd)
      .map((m) => {
        const scoreBps = m.aprBps - this.config!.riskPenaltyBpsPerPoint * Math.max(0, m.riskScore);
        return { m, scoreBps };
      })
      .filter((x) => x.scoreBps > 0);

    if (eligible.length === 0) {
      throw new LaseriumError('InvariantViolation', 'No eligible yield sources for routing');
    }

    const totalScore = eligible.reduce((acc, x) => acc + x.scoreBps, 0);
    if (totalScore <= 0) {
      throw new LaseriumError('InvariantViolation', 'Total yield score is non-positive');
    }

    // Deterministic integer allocation in bps.
    let remaining = 10_000;
    const allocations: YieldAllocation[] = [];

    for (let i = 0; i < eligible.length; i++) {
      const item = eligible[i];
      if (!item) {
        throw new LaseriumError('InvariantViolation', 'Eligible yield source missing');
      }
      const { m, scoreBps } = item;
      const isLast = i === eligible.length - 1;
      let weight = isLast ? remaining : Math.floor((scoreBps * 10_000) / totalScore);

      if (this.config.maxSingleSourceBps !== undefined) {
        weight = Math.min(weight, this.config.maxSingleSourceBps);
      }

      weight = Math.max(0, Math.min(weight, remaining));
      remaining -= weight;

      allocations.push({
        sourceId: m.sourceId,
        weightBps: weight,
        metrics: m
      });
    }

    // If we capped maxSingleSourceBps, we might have remaining bps; distribute round-robin.
    if (remaining > 0) {
      for (let i = 0; i < allocations.length && remaining > 0; i++) {
        const allocation = allocations[i];
        if (!allocation) continue;
        const cap = this.config.maxSingleSourceBps ?? 10_000;
        const room = cap - allocation.weightBps;
        if (room <= 0) continue;
        const add = Math.min(room, remaining);
        allocation.weightBps += add;
        remaining -= add;
      }
    }

    const sum = allocations.reduce((acc, a) => acc + a.weightBps, 0);
    if (sum !== 10_000) {
      throw new LaseriumError('InvariantViolation', 'Yield allocation did not sum to 10000 bps', {
        details: { sum }
      });
    }

    return allocations;
  }

  async rebalanceVault(vaultId: PublicKey): Promise<string> {
    const c = this.client as unknown as LaseriumClient;
    if (!('provider' in c)) {
      throw new LaseriumError('UnauthorizedAuthority', 'Readonly client cannot rebalance');
    }

    const ix = await new YieldRebalance(c).buildRebalanceIx({ vaultId });
    const tx = new Transaction().add(ix);
    return await c.provider.anchorProvider.sendAndConfirm(tx, []);
  }

  async rebalance(vaultId: PublicKey): Promise<string> {
    return this.rebalanceVault(vaultId);
  }

  async getYieldBreakdown(vaultId: PublicKey): Promise<unknown> {
    if (!this.config?.decodeYieldState) {
      throw new LaseriumError(
        'ProgramNotConfigured',
        'Yield breakdown requires decodeYieldState in yield.configure()'
      );
    }

    const yieldRouterPda = PDA.yieldRouter(this.client.programId).publicKey;
    const accountsNs = this.client.program.account as unknown as Record<
      string,
      { fetch: (pk: PublicKey) => Promise<unknown> }
    >;
    const yieldAccount = accountsNs[this.client.accountNames.yieldRouter];
    if (!yieldAccount) {
      throw new LaseriumError('ProgramNotConfigured', 'Yield router account type not found on program', {
        details: { accountType: this.client.accountNames.yieldRouter }
      });
    }
    const raw = await yieldAccount.fetch(yieldRouterPda);
    return this.config.decodeYieldState(raw, vaultId);
  }
}
