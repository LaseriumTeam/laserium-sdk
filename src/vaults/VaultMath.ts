import { LaseriumError } from '../errors/LaseriumError.js';
import { invariant } from '../utils/invariant.js';
import { mulDiv } from '../utils/math.js';
import type { VaultState } from '../types/VaultState.js';

export type PreviewDepositResult = {
  sharesOut: bigint;
};

export type PreviewWithdrawResult = {
  assetsOut: bigint;
};

export class VaultMath {
  static validateState(state: VaultState): void {
    invariant(state.totalAssets >= 0n, 'totalAssets must be non-negative');
    invariant(state.totalShares >= 0n, 'totalShares must be non-negative');

    if (state.totalShares === 0n) {
      invariant(state.totalAssets === 0n, 'empty vault must have totalAssets=0');
    }

    if (state.capacityAssets !== undefined) {
      invariant(state.capacityAssets >= 0n, 'capacityAssets must be non-negative');
    }

    if (state.utilizationBps !== undefined) {
      invariant(state.utilizationBps >= 0 && state.utilizationBps <= 10_000, 'utilizationBps out of range');
    }
  }

  static previewDeposit(state: VaultState, assetAmount: bigint): PreviewDepositResult {
    this.validateState(state);

    if (assetAmount <= 0n) {
      throw new LaseriumError('InvalidArgument', 'deposit amount must be > 0');
    }

    if (state.capacityAssets !== undefined) {
      const next = state.totalAssets + assetAmount;
      if (next > state.capacityAssets) {
        throw new LaseriumError('VaultCapacityExceeded', 'deposit exceeds vault capacity', {
          details: {
            totalAssets: state.totalAssets.toString(),
            deposit: assetAmount.toString(),
            capacityAssets: state.capacityAssets.toString()
          }
        });
      }
    }

    // Shares minted against NAV.
    // For the first deposit: 1 share == 1 asset unit.
    if (state.totalShares === 0n || state.totalAssets === 0n) {
      return { sharesOut: assetAmount };
    }

    const sharesOut = mulDiv(assetAmount, state.totalShares, state.totalAssets, 'down');
    if (sharesOut <= 0n) {
      throw new LaseriumError('InvalidShareConversion', 'deposit results in zero shares');
    }

    return { sharesOut };
  }

  static previewWithdraw(state: VaultState, shareAmount: bigint): PreviewWithdrawResult {
    this.validateState(state);

    if (shareAmount <= 0n) {
      throw new LaseriumError('InvalidArgument', 'withdraw shareAmount must be > 0');
    }

    if (state.totalShares === 0n || state.totalAssets === 0n) {
      throw new LaseriumError('VaultInsolvent', 'vault has no liquidity');
    }

    const assetsOut = mulDiv(shareAmount, state.totalAssets, state.totalShares, 'down');
    if (assetsOut <= 0n) {
      throw new LaseriumError('InvalidShareConversion', 'withdraw results in zero assets');
    }

    if (assetsOut > state.totalAssets) {
      throw new LaseriumError('VaultInsolvent', 'withdraw exceeds vault assets', {
        details: { assetsOut: assetsOut.toString(), totalAssets: state.totalAssets.toString() }
      });
    }

    return { assetsOut };
  }
}
