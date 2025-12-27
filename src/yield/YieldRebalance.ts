import type { TransactionInstruction } from '@solana/web3.js';
import type { PublicKey } from '@solana/web3.js';
import type { LaseriumClient } from '../client/LaseriumClient.js';
import { PDA } from '../accounts/PDA.js';
import { LaseriumError } from '../errors/LaseriumError.js';

export type RebalanceParams = {
  vaultId: PublicKey;
};

export class YieldRebalance {
  constructor(readonly client: LaseriumClient) {}

  async buildRebalanceIx(params: RebalanceParams): Promise<TransactionInstruction> {
    this.client.requireSigner();

    const program = this.client.program;
    const ixName = this.client.instructionNames.rebalanceVault;

    const yieldRouter = PDA.yieldRouter(this.client.programId).publicKey;
    const vault = PDA.vault(this.client.programId, params.vaultId).publicKey;

    const methods = program.methods as unknown as Record<string, unknown>;
    const method = methods[ixName];
    if (!method || typeof method !== 'function') {
      throw new LaseriumError('TransactionBuildError', 'Rebalance method not found on program', {
        details: { ixName }
      });
    }

    const builder = (method as () => unknown)();

    // Anchor builder shape: builder.accountsStrict(...).instruction()
    const withAccounts = (builder as { accountsStrict: (a: Record<string, PublicKey>) => unknown }).accountsStrict({
      [this.client.accountNames.yieldRouter]: yieldRouter,
      [this.client.accountNames.vault]: vault,
      authority: this.client.publicKey
    });

    const ix = await (withAccounts as { instruction: () => Promise<TransactionInstruction> }).instruction();
    return ix;
  }
}
