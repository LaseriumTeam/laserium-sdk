import type { Connection, PublicKey } from '@solana/web3.js';

export type OracleKind = 'pyth' | 'switchboard';

export type OracleFeed = {
  kind: OracleKind;
  address: PublicKey;
};

export type OraclePriceStatus =
  | 'unknown'
  | 'trading'
  | 'halted'
  | 'auction'
  | 'ignored';

export type OraclePrice = {
  kind: OracleKind;
  feed: PublicKey;

  price: bigint;
  conf: bigint;
  expo: number;

  publishSlot: bigint;
  publishTime: number;
  status: OraclePriceStatus;
};

export type OracleReadOptions = {
  commitment?: Parameters<Connection['getAccountInfo']>[1];
};

export interface PriceOracle {
  getPrice(feed: OracleFeed, opts?: OracleReadOptions): Promise<OraclePrice>;
}
