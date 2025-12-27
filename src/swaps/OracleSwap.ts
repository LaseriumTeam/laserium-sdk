import type { PublicKey } from '@solana/web3.js';
import { Transaction } from '@solana/web3.js';
import { LaseriumError } from '../errors/LaseriumError.js';
import { applyBps, clampBps, mulDiv, toBigIntAmount } from '../utils/math.js';
import type { OracleAdapter } from './OracleAdapter.js';
import type { SwapQuote } from './SwapQuote.js';
import type { LaseriumReadonlyClient } from '../client/LaseriumReadonlyClient.js';
import type { LaseriumClient } from '../client/LaseriumClient.js';
import { SwapInstructions } from './SwapInstructions.js';

export type GetSwapQuoteParams = {
  fromMint: PublicKey;
  toMint: PublicKey;
  amountIn: bigint | number | string;
  slippageBps: number;
  feeBps: number;
  spreadBps: number;
};

export class OracleSwap {
  constructor(readonly client: LaseriumReadonlyClient, readonly oracleAdapter: OracleAdapter) {}

  async getQuote(params: {
    from: PublicKey;
    to: PublicKey;
    amount: bigint | number | string;
    slippageBps: number;
    feeBps: number;
    spreadBps: number;
  }): Promise<SwapQuote> {
    return this.getSwapQuote({
      fromMint: params.from,
      toMint: params.to,
      amountIn: params.amount,
      slippageBps: params.slippageBps,
      feeBps: params.feeBps,
      spreadBps: params.spreadBps
    });
  }

  async getSwapQuote(params: GetSwapQuoteParams): Promise<SwapQuote> {
    const inAmount = toBigIntAmount(params.amountIn);
    const slippageBps = clampBps(params.slippageBps);
    const feeBps = clampBps(params.feeBps);
    const spreadBps = clampBps(params.spreadBps);

    if (inAmount === 0n) {
      throw new LaseriumError('InvalidArgument', 'amountIn must be > 0');
    }

    const cross = await this.oracleAdapter.getCrossRate(params.fromMint, params.toMint);

    // out ≈ in * price * 10^expo (price is integer, expo may be negative)
    // price is stored as integer at expo cross.expo.
    // Compute: out = in * price / 10^(-expo) if expo negative else in*price*10^expo.

    let rawOut: bigint;
    if (cross.expo >= 0) {
      const scale = 10n ** BigInt(cross.expo);
      rawOut = inAmount * cross.price * scale;
    } else {
      const denom = 10n ** BigInt(-cross.expo);
      rawOut = mulDiv(inAmount * cross.price, 1n, denom, 'down');
    }

    // Apply spread (worse price) + fee.
    const afterSpread = applyBps(rawOut, spreadBps, 'down');
    const afterFee = applyBps(afterSpread, feeBps, 'down');

    const minOutAmount = applyBps(afterFee, slippageBps, 'down');

    return {
      fromMint: params.fromMint,
      toMint: params.toMint,
      inAmount,
      outAmount: afterFee,
      price: cross.price,
      priceExpo: cross.expo,
      feeBps,
      spreadBps,
      oracle: {
        kind: cross.oracleUsed.kind,
        feed: cross.oracleUsed.feed,
        publishTime: cross.oracleUsed.publishTime,
        conf: cross.oracleUsed.conf,
        expo: cross.oracleUsed.expo
      },
      minOutAmount
    };
  }

  async simulateSwap(params: GetSwapQuoteParams): Promise<SwapQuote> {
    return this.getSwapQuote(params);
  }

  async executeSwap(quote: SwapQuote): Promise<string> {
    const c = this.client as unknown as LaseriumClient;
    if (!('provider' in c)) {
      throw new LaseriumError('UnauthorizedAuthority', 'Readonly client cannot execute swaps');
    }

    if (quote.minOutAmount > quote.outAmount) {
      throw new LaseriumError('InvalidSlippage', 'minOutAmount exceeds quoted outAmount');
    }

    const ix = await new SwapInstructions(c).buildExecuteSwapIx({ quote });
    const tx = new Transaction().add(ix);
    return await c.provider.anchorProvider.sendAndConfirm(tx, []);
  }

  async execute(quote: SwapQuote): Promise<string> {
    return this.executeSwap(quote);
  }
}
