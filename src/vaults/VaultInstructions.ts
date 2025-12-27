import type { TransactionInstruction } from '@solana/web3.js';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import BN from 'bn.js';

import type { LaseriumClient } from '../client/LaseriumClient.js';
import { PDA } from '../accounts/PDA.js';
import { LaseriumError } from '../errors/LaseriumError.js';
import { assertNonNull } from '../utils/invariant.js';
import type { VaultState } from '../types/VaultState.js';

export type DepositParams = {
  vaultId: PublicKey;
  amount: bigint;

  /** Override derived ATA if needed */
  userAssetAta?: PublicKey;
  vaultAssetAta?: PublicKey;
};

export type WithdrawParams = {
  vaultId: PublicKey;
  shares: bigint;

  userAssetAta?: PublicKey;
  vaultAssetAta?: PublicKey;
};

export type VaultAccountDecoder = (raw: unknown, vaultPda: PublicKey, vaultId: PublicKey) => VaultState;

function toBN(value: bigint): BN {
  if (value < 0n) throw new LaseriumError('InvalidArgument', 'amount must be non-negative');
  return new BN(value.toString(10));
}

export class VaultInstructions {
  constructor(
    readonly client: LaseriumClient,
    readonly decodeVaultState: VaultAccountDecoder
  ) {}

  async buildDepositIx(params: DepositParams): Promise<TransactionInstruction> {
    this.client.requireSigner();

    const vaultPda = PDA.vault(this.client.programId, params.vaultId).publicKey;
    const vaultAuthority = PDA.vaultAuthority(this.client.programId, params.vaultId).publicKey;
    const position = PDA.position(this.client.programId, params.vaultId, this.client.publicKey).publicKey;

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
    const rawVault = await vaultAccount.fetch(vaultPda);
    const vaultState = this.decodeVaultState(rawVault, vaultPda, params.vaultId);

    const userAssetAta =
      params.userAssetAta ?? getAssociatedTokenAddressSync(vaultState.assetMint, this.client.publicKey, false);

    const vaultAssetAta =
      params.vaultAssetAta ?? getAssociatedTokenAddressSync(vaultState.assetMint, vaultAuthority, true);

    const ixName = this.client.instructionNames.deposit;
    const methods = this.client.program.methods as unknown as Record<string, unknown>;
    const method = methods[ixName];
    if (!method || typeof method !== 'function') {
      throw new LaseriumError('TransactionBuildError', 'Deposit method not found on program', {
        details: { ixName }
      });
    }

    const builder = (method as (amount: BN) => unknown)(toBN(params.amount));

    const accounts = {
      [this.client.accountNames.vault]: vaultPda,
      [this.client.accountNames.vaultAuthority]: vaultAuthority,
      [this.client.accountNames.position]: position,
      [this.client.accountNames.treasury]: PDA.treasury(this.client.programId).publicKey,
      user: this.client.publicKey,
      userAssetAta,
      vaultAssetAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId
    } satisfies Record<string, PublicKey>;

    const withAccounts = (builder as { accountsStrict: (a: Record<string, PublicKey>) => unknown }).accountsStrict(
      accounts
    );

    return await (withAccounts as { instruction: () => Promise<TransactionInstruction> }).instruction();
  }

  async buildWithdrawIx(params: WithdrawParams): Promise<TransactionInstruction> {
    this.client.requireSigner();

    const vaultPda = PDA.vault(this.client.programId, params.vaultId).publicKey;
    const vaultAuthority = PDA.vaultAuthority(this.client.programId, params.vaultId).publicKey;
    const position = PDA.position(this.client.programId, params.vaultId, this.client.publicKey).publicKey;

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
    const rawVault = await vaultAccount.fetch(vaultPda);
    const vaultState = this.decodeVaultState(rawVault, vaultPda, params.vaultId);

    const userAssetAta =
      params.userAssetAta ?? getAssociatedTokenAddressSync(vaultState.assetMint, this.client.publicKey, false);

    const vaultAssetAta =
      params.vaultAssetAta ?? getAssociatedTokenAddressSync(vaultState.assetMint, vaultAuthority, true);

    const ixName = this.client.instructionNames.withdraw;
    const methods = this.client.program.methods as unknown as Record<string, unknown>;
    const method = methods[ixName];
    if (!method || typeof method !== 'function') {
      throw new LaseriumError('TransactionBuildError', 'Withdraw method not found on program', {
        details: { ixName }
      });
    }

    const builder = (method as (shares: BN) => unknown)(toBN(params.shares));

    const accounts = {
      [this.client.accountNames.vault]: vaultPda,
      [this.client.accountNames.vaultAuthority]: vaultAuthority,
      [this.client.accountNames.position]: position,
      [this.client.accountNames.treasury]: PDA.treasury(this.client.programId).publicKey,
      user: this.client.publicKey,
      userAssetAta,
      vaultAssetAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId
    } satisfies Record<string, PublicKey>;

    const withAccounts = (builder as { accountsStrict: (a: Record<string, PublicKey>) => unknown }).accountsStrict(
      accounts
    );

    return await (withAccounts as { instruction: () => Promise<TransactionInstruction> }).instruction();
  }

  static defaultVaultDecoder(raw: unknown, vaultPda: PublicKey, vaultId: PublicKey): VaultState {
    // Default mapping assumes Anchor account fields with common names.
    // If your on-chain schema differs, provide a custom decoder.
    const obj = raw as Record<string, unknown>;
    const assetMint = obj['assetMint'];
    const totalAssets = obj['totalAssets'];
    const totalShares = obj['totalShares'];

    if (!(assetMint instanceof PublicKey)) {
      throw new LaseriumError('AccountParseError', 'vault.assetMint missing or invalid');
    }

    const toBigInt = (v: unknown, field: string): bigint => {
      if (typeof v === 'bigint') return v;
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return BigInt(v);
      if (v && typeof v === 'object' && 'toString' in v) {
        const s = String((v as { toString: () => string }).toString());
        if (/^-?[0-9]+$/.test(s)) return BigInt(s);
      }
      throw new LaseriumError('AccountParseError', `vault.${field} missing or invalid`);
    };

    const parsed: VaultState = {
      vaultId,
      assetMint,
      totalAssets: toBigInt(totalAssets, 'totalAssets'),
      totalShares: toBigInt(totalShares, 'totalShares')
    };

    if (obj['capacityAssets'] !== undefined)
      parsed.capacityAssets = toBigInt(obj['capacityAssets'], 'capacityAssets');
    if (obj['utilizationBps'] !== undefined) {
      const n = obj['utilizationBps'];
      if (typeof n !== 'number') {
        throw new LaseriumError('AccountParseError', 'vault.utilizationBps invalid');
      }
      parsed.utilizationBps = n;
    }

    if (obj['lastUpdatedTs'] !== undefined) {
      const ts = obj['lastUpdatedTs'];
      if (typeof ts === 'number') parsed.lastUpdatedTs = ts;
    }

    // Ensure vaultPda is used (avoid unused var without weakening types)
    assertNonNull(vaultPda, 'vaultPda');

    return parsed;
  }
}
