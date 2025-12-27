import type { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { SystemProgram } from '@solana/web3.js';










































































import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import BN from 'bn.js';

import type { LaseriumClient } from '../client/LaseriumClient.js';
import { PDA } from '../accounts/PDA.js';
import { LaseriumError } from '../errors/LaseriumError.js';
import type { SwapQuote } from './SwapQuote.js';

function toBN(value: bigint): BN {
  if (value < 0n) throw new LaseriumError('InvalidArgument', 'amount must be non-negative');
  return new BN(value.toString(10));
}

export type ExecuteSwapParams = {
  quote: SwapQuote;

  /** Override derived ATAs if needed */
  userFromAta?: PublicKey;
  userToAta?: PublicKey;
};

export class SwapInstructions {
  constructor(readonly client: LaseriumClient) {}

  async buildExecuteSwapIx(params: ExecuteSwapParams): Promise<TransactionInstruction> {
    this.client.requireSigner();

    const ixName = this.client.instructionNames.oracleSwap;
    const methods = this.client.program.methods as unknown as Record<string, unknown>;
    const method = methods[ixName];
    if (!method || typeof method !== 'function') {
      throw new LaseriumError('TransactionBuildError', 'Swap method not found on program', {
        details: { ixName }
      });
    }

    const userFromAta =
      params.userFromAta ?? getAssociatedTokenAddressSync(params.quote.fromMint, this.client.publicKey, false);
    const userToAta = params.userToAta ?? getAssociatedTokenAddressSync(params.quote.toMint, this.client.publicKey, false);

    const treasury = PDA.treasury(this.client.programId).publicKey;
    const treasuryFromAta = getAssociatedTokenAddressSync(params.quote.fromMint, treasury, true);
    const treasuryToAta = getAssociatedTokenAddressSync(params.quote.toMint, treasury, true);

    // Instruction args are protocol-specific; we pass what an oracle-priced swap typically needs:
    // in_amount, min_out_amount.
    const builder = (method as (inAmount: BN, minOut: BN) => unknown)(
      toBN(params.quote.inAmount),
      toBN(params.quote.minOutAmount)
    );

    const accounts = {
      user: this.client.publicKey,
      userFromAta,
      userToAta,
      treasury,
      treasuryFromAta,
      treasuryToAta,
      oracleFeed: params.quote.oracle.feed,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId
    } satisfies Record<string, PublicKey>;

    const withAccounts = (builder as { accountsStrict: (a: Record<string, PublicKey>) => unknown }).accountsStrict(
      accounts
    );

    return await (withAccounts as { instruction: () => Promise<TransactionInstruction> }).instruction();
  }
}
