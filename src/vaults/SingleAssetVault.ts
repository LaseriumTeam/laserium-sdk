import type { PublicKey, TransactionSignature } from '@solana/web3.js';
import { Transaction } from '@solana/web3.js';

import type { LaseriumReadonlyClient } from '../client/LaseriumReadonlyClient.js';
import type { LaseriumClient } from '../client/LaseriumClient.js';
import { LaseriumError } from '../errors/LaseriumError.js';
import { toBigIntAmount } from '../utils/math.js';
import { PDA } from '../accounts/PDA.js';

import type { VaultState } from '../types/VaultState.js';
import { VaultMath } from './VaultMath.js';
import { VaultInstructions, type DepositParams, type VaultAccountDecoder, type WithdrawParams } from './VaultInstructions.js';
import { VaultPosition, type PositionAccountDecoder } from './VaultPosition.js';

export type VaultConfig = {
  decodeVaultState?: VaultAccountDecoder;
  decodePositionState?: PositionAccountDecoder;
};

export class SingleAssetVault {
  private cfg: VaultConfig;

  constructor(readonly client: LaseriumReadonlyClient) {
    this.cfg = {};
  }

  configure(cfg: VaultConfig): void {
    this.cfg = cfg;
  }

  private vaultDecoder(): VaultAccountDecoder {
    return this.cfg.decodeVaultState ?? VaultInstructions.defaultVaultDecoder;
  }

  private positionDecoder(): PositionAccountDecoder {
    return this.cfg.decodePositionState ?? VaultPosition.defaultPositionDecoder;
  }

  async getVaultState(vaultId: PublicKey): Promise<VaultState> {
    const vaultPda = PDA.vault(this.client.programId, vaultId).publicKey;
    const accountsNs = this.client.program.account as unknown as Record<
      string,
      { fetch: (pk: PublicKey) => Promise<unknown> }
    >;
    const vaultAccount = accountsNs[this.client.accountNames.vault];
    if (!vaultAccount) {
      throw new LaseriumError('ProgramNotConfigured', 'Vault account type not found on program', {
        details: { accountType: this.client.accountNames.vault }
      });
    }
    const raw = await vaultAccount.fetch(vaultPda);
    return this.vaultDecoder()(raw, vaultPda, vaultId);
  }

  async previewDeposit(params: { vaultId: PublicKey; amount: bigint | number | string }): Promise<{ sharesOut: bigint }> {
    const state = await this.getVaultState(params.vaultId);
    const amount = toBigIntAmount(params.amount);
    return VaultMath.previewDeposit(state, amount);
  }

  async previewWithdraw(params: { vaultId: PublicKey; shares: bigint | number | string }): Promise<{ assetsOut: bigint }> {
    const state = await this.getVaultState(params.vaultId);
    const shares = toBigIntAmount(params.shares);
    return VaultMath.previewWithdraw(state, shares);
  }

  async getVaultTVL(vaultId: PublicKey): Promise<bigint> {
    const state = await this.getVaultState(vaultId);
    return state.totalAssets;
  }

  async getVaultAPR(vaultId: PublicKey): Promise<number> {
    const state = await this.getVaultState(vaultId);

    // Deterministic: uses live yield source metrics provided by configured YieldSource implementations.
    // If yield router is not configured, fail loudly.
    try {
      const route = await this.client.yield.getOptimalYieldRoute(state.assetMint);
      const aprBps = Math.round(
        route.reduce((acc, a) => acc + (a.metrics.aprBps * a.weightBps) / 10_000, 0)
      );
      return aprBps;
    } catch (cause) {
      throw new LaseriumError('ProgramNotConfigured', 'Unable to compute APR; configure yield sources', {
        cause
      });
    }
  }

  async getPosition(vaultId: PublicKey, owner: PublicKey): Promise<ReturnType<VaultPosition['getPosition']>> {
    return new VaultPosition(this.client, this.positionDecoder()).getPosition(vaultId, owner);
  }

  async deposit(params: { vaultId: PublicKey; amount: bigint | number | string }): Promise<TransactionSignature> {
    const c = this.client as unknown as LaseriumClient;
    if (!('provider' in c)) {
      throw new LaseriumError('UnauthorizedAuthority', 'Readonly client cannot deposit');
    }

    const amount = toBigIntAmount(params.amount);

    // Client-side invariant checks (capacity, share math expectations).
    await this.previewDeposit({ vaultId: params.vaultId, amount });

    const ix = await new VaultInstructions(c, this.vaultDecoder()).buildDepositIx({
      vaultId: params.vaultId,
      amount
    } satisfies DepositParams);

    const tx = new Transaction().add(ix);
    const sig = await c.provider.anchorProvider.sendAndConfirm(tx, []);
    return sig;
  }

  async withdraw(params: { vaultId: PublicKey; shares: bigint | number | string }): Promise<TransactionSignature> {
    const c = this.client as unknown as LaseriumClient;
    if (!('provider' in c)) {
      throw new LaseriumError('UnauthorizedAuthority', 'Readonly client cannot withdraw');
    }

    const shares = toBigIntAmount(params.shares);

    // Client-side invariant checks.
    await this.previewWithdraw({ vaultId: params.vaultId, shares });

    const ix = await new VaultInstructions(c, this.vaultDecoder()).buildWithdrawIx({
      vaultId: params.vaultId,
      shares
    } satisfies WithdrawParams);

    const tx = new Transaction().add(ix);
    const sig = await c.provider.anchorProvider.sendAndConfirm(tx, []);
    return sig;
  }
}
