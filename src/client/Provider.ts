import type { Connection, ConfirmOptions } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

export type ProviderConfig = {
  connection: Connection;
  wallet: anchor.Wallet;
  confirmOptions?: ConfirmOptions;
};

export class Provider {
  readonly anchorProvider: anchor.AnchorProvider;

  constructor(readonly config: ProviderConfig) {
    this.anchorProvider = new anchor.AnchorProvider(
      config.connection,
      config.wallet,
      config.confirmOptions ?? anchor.AnchorProvider.defaultOptions()
    );
  }
}
