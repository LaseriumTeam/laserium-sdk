import type { PublicKey } from '@solana/web3.js';
import { LaseriumError } from '../errors/LaseriumError.js';
import type { OracleFeed, OraclePrice, PriceOracle } from '../oracle/PriceOracle.js';
import { absBigInt, mulDiv } from '../utils/math.js';

export type OracleConfig = {
  /**
   * For swaps quoted via USD cross, configure per-mint USD feeds.
   */
  usdFeedsByMint: Map<string, OracleFeed>;

  maxAgeSec: number;
  maxConfidenceBps: number;

  /**
   * If true, reject non-trading statuses.
   */
  requireTradingStatus?: boolean;
};

export type CrossRate = {
  /** price of `to` denominated in `from` */
  price: bigint;
  expo: number;
  oracleUsed: OraclePrice;
};

export class OracleAdapter {
  constructor(
    readonly oracle: PriceOracle,
    readonly config: OracleConfig
  ) {}

  private validateFresh(price: OraclePrice, nowSec: number): void {
    const age = nowSec - price.publishTime;
    if (age > this.config.maxAgeSec) {
      throw new LaseriumError('OraclePriceStale', 'Oracle price is stale', {
        details: { ageSec: age, maxAgeSec: this.config.maxAgeSec, feed: price.feed.toBase58() }
      });
    }

    if (this.config.requireTradingStatus && price.status !== 'trading') {
      throw new LaseriumError('OracleConfidenceTooWide', 'Oracle price is not in TRADING status', {
        details: { status: price.status }
      });
    }

    // confidence / |price| check in bps, both in same exponent.
    const absPrice = absBigInt(price.price);
    if (absPrice === 0n) {
      throw new LaseriumError('OracleConfidenceTooWide', 'Oracle price is zero');
    }

    const confBps = Number(mulDiv(price.conf, 10_000n, absPrice, 'up'));
    if (confBps > this.config.maxConfidenceBps) {
      throw new LaseriumError('OracleConfidenceTooWide', 'Oracle confidence interval too wide', {
        details: { confBps, maxConfidenceBps: this.config.maxConfidenceBps }
      });
    }
  }

  async getUsdPrice(mint: PublicKey): Promise<OraclePrice> {
    const feed = this.config.usdFeedsByMint.get(mint.toBase58());
    if (!feed) {
      throw new LaseriumError('InvalidArgument', 'Missing USD oracle feed for mint', {
        details: { mint: mint.toBase58() }
      });
    }

    const price = await this.oracle.getPrice(feed);
    this.validateFresh(price, Math.floor(Date.now() / 1000));
    return price;
  }

  /**
   * Computes to/from cross-rate using USD denominated feeds.
   */
  async getCrossRate(fromMint: PublicKey, toMint: PublicKey): Promise<CrossRate> {
    const fromUsd = await this.getUsdPrice(fromMint);
    const toUsd = await this.getUsdPrice(toMint);

    // Cross: (toUsd / fromUsd). Both fixed-point with exponents.
    // Represent result as fixed-point with expo = toExpo - fromExpo.
    // price = toPrice / fromPrice (rational); keep deterministic integer by scaling.

    if (fromUsd.price === 0n) {
      throw new LaseriumError('OracleConfidenceTooWide', 'fromUsd oracle returned zero price');
    }

    const expo = toUsd.expo - fromUsd.expo;

    // Store ratio as integer with the computed exponent:
    // ratio = toPrice / fromPrice, both int.
    // Keep as a fraction; encode numerator/denom via mulDiv to keep integer.
    // Use 1e18 scaling for deterministic precision.
    const SCALE = 1_000_000_000_000_000_000n;
    const scaled = mulDiv(toUsd.price, SCALE, fromUsd.price, 'down');

    // Result meaning: price = scaled, expo = expo - 18.
    return {
      price: scaled,
      expo: expo - 18,
      oracleUsed: toUsd
    };
  }
}
