import type { Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { LaseriumError } from '../errors/LaseriumError.js';
import type { OracleFeed, OraclePrice, OracleReadOptions, PriceOracle } from './PriceOracle.js';

const PC_MAGIC = 0xa1b2c3d4;

const OFFSETS = {
  magic: 0,
  expo: 20,
  timestamp: 96,
  agg: 208
} as const;

const PRICE_INFO = {
  price: 0,
  conf: 8,
  status: 16,
  pubSlot: 24
} as const;

function readU32LE(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset);
}
function readI32LE(buf: Buffer, offset: number): number {
  return buf.readInt32LE(offset);
}
function readI64LEBigInt(buf: Buffer, offset: number): bigint {
  return buf.readBigInt64LE(offset);
}
function readU64LEBigInt(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

function mapStatus(code: number): OraclePrice['status'] {
  switch (code) {
    case 1:
      return 'trading';
    case 2:
      return 'halted';
    case 3:
      return 'auction';
    case 4:
      return 'ignored';
    default:
      return 'unknown';
  }
}

export class PythAdapter implements PriceOracle {
  readonly kind = 'pyth' as const;
  constructor(readonly connection: Connection) {}

  async getPrice(feed: OracleFeed, opts?: OracleReadOptions): Promise<OraclePrice> {
    if (feed.kind !== 'pyth') {
      throw new LaseriumError('InvalidArgument', 'PythAdapter can only read pyth feeds');
    }

    const accountInfo = await this.connection.getAccountInfo(feed.address, opts?.commitment);
    if (!accountInfo?.data) {
      throw new LaseriumError('AccountParseError', 'Pyth price account not found', {
        details: { feed: feed.address.toBase58() }
      });
    }

    const data = Buffer.from(accountInfo.data);
    if (data.length < 240) {
      throw new LaseriumError('AccountParseError', 'Pyth price account data too small', {
        details: { bytes: data.length }
      });
    }

    const magic = readU32LE(data, OFFSETS.magic);
    if (magic !== PC_MAGIC) {
      throw new LaseriumError('AccountParseError', 'Invalid Pyth magic', {
        details: { magic }
      });
    }

    const expo = readI32LE(data, OFFSETS.expo);
    const publishTime = Number(readI64LEBigInt(data, OFFSETS.timestamp));

    const aggBase = OFFSETS.agg;
    const price = readI64LEBigInt(data, aggBase + PRICE_INFO.price);
    const conf = readU64LEBigInt(data, aggBase + PRICE_INFO.conf);
    const statusCode = readU32LE(data, aggBase + PRICE_INFO.status);
    const publishSlot = readU64LEBigInt(data, aggBase + PRICE_INFO.pubSlot);

    return {
      kind: 'pyth',
      feed: new PublicKey(feed.address),
      price,
      conf,
      expo,
      publishSlot,
      publishTime,
      status: mapStatus(statusCode)
    };
  }
}
