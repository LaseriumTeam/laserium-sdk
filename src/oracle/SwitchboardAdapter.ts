import type { Connection } from '@solana/web3.js';
import type { OracleFeed, OraclePrice, OracleReadOptions, PriceOracle } from './PriceOracle.js';
import { LaseriumError } from '../errors/LaseriumError.js';

export type SwitchboardAdapterConfig = {
  /**
   * Switchboard has multiple product lines (V2 feeds, On-Demand Oracle Quotes).
   * This adapter intentionally requires an application-provided decoder to avoid
   * shipping incorrect layouts.
   */
  decodeAggregator: (rawAccountData: Buffer, feedAddress: string) => {
    price: bigint;
    conf: bigint;
    expo: number;
    publishTime: number;
    publishSlot: bigint;
    status?: OraclePrice['status'];
  };
};

export class SwitchboardAdapter implements PriceOracle {
  readonly kind = 'switchboard' as const;

  constructor(
    readonly connection: Connection,
    readonly config: SwitchboardAdapterConfig
  ) {}

  async getPrice(feed: OracleFeed, opts?: OracleReadOptions): Promise<OraclePrice> {
    if (feed.kind !== 'switchboard') {
      throw new LaseriumError('InvalidArgument', 'SwitchboardAdapter can only read switchboard feeds');
    }

    const accountInfo = await this.connection.getAccountInfo(feed.address, opts?.commitment);
    if (!accountInfo?.data) {
      throw new LaseriumError('AccountParseError', 'Switchboard feed account not found', {
        details: { feed: feed.address.toBase58() }
      });
    }

    const decoded = this.config.decodeAggregator(Buffer.from(accountInfo.data), feed.address.toBase58());

    return {
      kind: 'switchboard',
      feed: feed.address,
      price: decoded.price,
      conf: decoded.conf,
      expo: decoded.expo,
      publishTime: decoded.publishTime,
      publishSlot: decoded.publishSlot,
      status: decoded.status ?? 'unknown'
    };
  }
}
