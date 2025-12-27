import type { Connection } from '@solana/web3.js';
import { Keypair } from '@solana/web3.js';
import type { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import type { Idl, Program } from '@coral-xyz/anchor';

import { LaseriumError } from '../errors/LaseriumError.js';
import type { OracleFeed, PriceOracle } from '../oracle/PriceOracle.js';
import { PythAdapter } from '../oracle/PythAdapter.js';
import { SwitchboardAdapter, type SwitchboardAdapterConfig } from '../oracle/SwitchboardAdapter.js';
import { OracleAdapter, type OracleConfig } from '../swaps/OracleAdapter.js';
import { OracleSwap } from '../swaps/OracleSwap.js';
import { SingleAssetVault } from '../vaults/SingleAssetVault.js';
import { AdaptiveYieldRouter } from '../yield/AdaptiveYieldRouter.js';

export type LaseriumInstructionNames = {
  deposit: string;
  withdraw: string;
  oracleSwap: string;
  rebalanceVault: string;
};

export type LaseriumAccountNames = {
  vault: string;
  vaultAuthority: string;
  position: string;
  treasury: string;
  yieldRouter: string;
};

export type LaseriumReadonlyClientConfig = {
  connection: Connection;
  programId: PublicKey;

  /**
   * Provide either an initialized Anchor `program`, or `idl` to construct it.
   * The SDK does not ship an IDL to avoid fake / placeholder contracts.
   */
  program?: Program<Idl>;
  idl?: Idl;

  /**
   * Oracle feeds indexed by SPL mint address (base58) for USD-cross quotes.
   */
  oracleConfig: {
    usdFeedsByMint: Map<string, OracleFeed>;
    maxAgeSec: number;
    maxConfidenceBps: number;
    requireTradingStatus?: boolean;

    /**
     * Switchboard decoding is intentionally app-provided (layout depends on product line).
     */
    switchboard?: SwitchboardAdapterConfig;
  };

  instructionNames?: Partial<LaseriumInstructionNames>;
  accountNames?: Partial<LaseriumAccountNames>;
};

class OracleRouter implements PriceOracle {
  constructor(
    readonly pyth: PythAdapter,
    readonly switchboard?: SwitchboardAdapter
  ) {}

  async getPrice(feed: OracleFeed): ReturnType<PriceOracle['getPrice']> {
    if (feed.kind === 'pyth') return this.pyth.getPrice(feed);
    if (feed.kind === 'switchboard') {
      if (!this.switchboard) {
        throw new LaseriumError('OracleAdapterUnavailable', 'Switchboard adapter not configured');
      }
      return this.switchboard.getPrice(feed);
    }
    throw new LaseriumError('InvalidArgument', 'Unsupported oracle kind');
  }
}

export class LaseriumReadonlyClient {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly program: Program<Idl>;

  readonly instructionNames: LaseriumInstructionNames;
  readonly accountNames: LaseriumAccountNames;

  readonly oracle: PriceOracle;
  readonly swapOracleAdapter: OracleAdapter;

  readonly vault: SingleAssetVault;
  readonly swap: OracleSwap;
  readonly yield: AdaptiveYieldRouter;

  constructor(readonly config: LaseriumReadonlyClientConfig) {
    this.connection = config.connection;
    this.programId = config.programId;

    this.instructionNames = {
      deposit: config.instructionNames?.deposit ?? 'deposit',
      withdraw: config.instructionNames?.withdraw ?? 'withdraw',
      oracleSwap: config.instructionNames?.oracleSwap ?? 'oracleSwap',
      rebalanceVault: config.instructionNames?.rebalanceVault ?? 'rebalanceVault'
    };

    this.accountNames = {
      vault: config.accountNames?.vault ?? 'vault',
      vaultAuthority: config.accountNames?.vaultAuthority ?? 'vaultAuthority',
      position: config.accountNames?.position ?? 'position',
      treasury: config.accountNames?.treasury ?? 'treasury',
      yieldRouter: config.accountNames?.yieldRouter ?? 'yieldRouter'
    };

    this.program = config.program ?? this.buildReadonlyProgram(config);

    const pyth = new PythAdapter(this.connection);
    const switchboard = config.oracleConfig.switchboard
      ? new SwitchboardAdapter(this.connection, config.oracleConfig.switchboard)
      : undefined;

    this.oracle = new OracleRouter(pyth, switchboard);

    const oracleAdapterConfig: OracleConfig = {
      usdFeedsByMint: config.oracleConfig.usdFeedsByMint,
      maxAgeSec: config.oracleConfig.maxAgeSec,
      maxConfidenceBps: config.oracleConfig.maxConfidenceBps,
      ...(config.oracleConfig.requireTradingStatus !== undefined
        ? { requireTradingStatus: config.oracleConfig.requireTradingStatus }
        : {})
    };

    this.swapOracleAdapter = new OracleAdapter(this.oracle, oracleAdapterConfig);

    this.vault = new SingleAssetVault(this);
    this.swap = new OracleSwap(this, this.swapOracleAdapter);
    this.yield = new AdaptiveYieldRouter(this);
  }

  private buildReadonlyProgram(cfg: LaseriumReadonlyClientConfig): Program<Idl> {
    if (!cfg.idl) {
      throw new LaseriumError(
        'ProgramNotConfigured',
        'Provide either `program` or `idl` to LaseriumReadonlyClient'
      );
    }

    // Anchor requires a wallet in the provider; we supply a non-signing wallet.
    const provider = new anchor.AnchorProvider(
      cfg.connection,
      new anchor.Wallet(Keypair.generate()),
      anchor.AnchorProvider.defaultOptions()
    );

    return new anchor.Program(cfg.idl, provider);
  }
}
