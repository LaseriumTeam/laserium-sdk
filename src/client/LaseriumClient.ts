import type { ConfirmOptions, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';

import { Provider } from './Provider.js';
import { LaseriumReadonlyClient, type LaseriumReadonlyClientConfig } from './LaseriumReadonlyClient.js';
import { LaseriumError } from '../errors/LaseriumError.js';

export type LaseriumClientConfig = Omit<LaseriumReadonlyClientConfig, 'program'> & {
  wallet: anchor.Wallet;
  confirmOptions?: ConfirmOptions;
  idl: Idl;
};

export class LaseriumClient extends LaseriumReadonlyClient {
  readonly wallet: anchor.Wallet;
  readonly provider: Provider;

  constructor(cfg: LaseriumClientConfig) {
    const provider = new Provider({
      connection: cfg.connection,
      wallet: cfg.wallet,
      ...(cfg.confirmOptions ? { confirmOptions: cfg.confirmOptions } : {})
    });

    const program = new anchor.Program(cfg.idl, provider.anchorProvider);

    super({
      ...cfg,
      program
    });

    this.wallet = cfg.wallet;
    this.provider = provider;
  }

  get publicKey(): PublicKey {
    const pk = this.wallet.publicKey;
    if (!pk) {
      throw new LaseriumError('UnauthorizedAuthority', 'Wallet has no publicKey');
    }
    return pk;
  }

  requireSigner(): void {
    if (!this.wallet.publicKey) {
      throw new LaseriumError('UnauthorizedAuthority', 'Wallet publicKey missing');
    }
  }
}
