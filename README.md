# laserium-sdk

Laserium SDK for interacting with the Laserium program on Solana: **Single-Asset Vaults**, **oracle-priced swaps**, and **adaptive yield routing**.

Important notes:

- This SDK **does not ship an IDL**. You must provide a real `idl` (or an initialized Anchor `program`) for your deployment.
- Token amounts are expected in **base units** (e.g., USDC has 6 decimals → 1 USDC = `1_000_000`).

## Install

Requires Node.js `>= 18`.

```bash
npm i laserium-sdk
```

## Quickstart

There are two client modes:

- `LaseriumReadonlyClient`: reads state + computes quotes (no signer)
- `LaseriumClient`: sends transactions (deposit/withdraw/swap/rebalance)

### 1) Configure oracle feeds (required for swap quotes)

The oracle adapter computes cross-rates via USD feeds. Provide a map of SPL mint → USD feed:

```ts
import { PublicKey } from '@solana/web3.js';
import type { OracleFeed } from 'laserium-sdk';

// Map key is mint base58 string
const USDC_MINT = new PublicKey('USDC_MINT_BASE58');
const SOL_MINT = new PublicKey('SOL_MINT_BASE58');

const usdcUsdFeed: OracleFeed = {
	kind: 'pyth',
	address: new PublicKey('PYTH_USDC_USD_FEED_BASE58')
};

const solUsdFeed: OracleFeed = {
	kind: 'pyth',
	address: new PublicKey('PYTH_SOL_USD_FEED_BASE58')
};

export const oracleConfig = {
	usdFeedsByMint: new Map<string, OracleFeed>([
		[USDC_MINT.toBase58(), usdcUsdFeed],
		[SOL_MINT.toBase58(), solUsdFeed]
	]),
	maxAgeSec: 60,
	maxConfidenceBps: 200

	// Optional:
	// requireTradingStatus: true,

	// Switchboard decoding is intentionally app-provided.
	// switchboard: { ... }
};
```

### 2) Readonly client (read state + quote)

`LaseriumReadonlyClient` requires `programId` and either:

- `program` (an initialized Anchor Program), or
- `idl` (an IDL JSON to build a readonly Program internally)

```ts
import { Connection, PublicKey } from '@solana/web3.js';
import { LaseriumReadonlyClient } from 'laserium-sdk';
import type { Idl } from '@coral-xyz/anchor';
import { oracleConfig } from './oracleConfig.js';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const programId = new PublicKey('YOUR_PROGRAM_ID_BASE58');

// You supply a real IDL (loading method is up to your app).
const idl = {} as Idl;

const client = new LaseriumReadonlyClient({
	connection,
	programId,
	idl,
	oracleConfig
});
```

### 3) Signer client (send transactions)

For deposit/withdraw/swap/rebalance you need `LaseriumClient` and a signing wallet.

```ts
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { LaseriumClient } from 'laserium-sdk';
import type { Idl } from '@coral-xyz/anchor';
import { oracleConfig } from './oracleConfig.js';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const programId = new PublicKey('YOUR_PROGRAM_ID_BASE58');
const idl = {} as Idl;

// Example wallet from a Keypair (production: load from your key management / adapter)
const kp = Keypair.generate();
const wallet = new anchor.Wallet(kp);

const client = new LaseriumClient({
	connection,
	programId,
	wallet,
	idl,
	oracleConfig
});
```

## Vault

### Read vault state

```ts
import { PublicKey } from '@solana/web3.js';

const vaultId = new PublicKey('VAULT_ID_BASE58');
const state = await client.vault.getVaultState(vaultId);

console.log(state.assetMint.toBase58());
console.log(state.totalAssets.toString());
console.log(state.totalShares.toString());
```

### Preview deposit / withdraw

```ts
const previewIn = await client.vault.previewDeposit({ vaultId, amount: 1_000_000n });
console.log(previewIn.sharesOut.toString());

const previewOut = await client.vault.previewWithdraw({ vaultId, shares: previewIn.sharesOut });
console.log(previewOut.assetsOut.toString());
```

### Deposit / withdraw (requires `LaseriumClient`)

```ts
const sig1 = await client.vault.deposit({ vaultId, amount: 1_000_000n });
console.log('deposit tx:', sig1);

const sig2 = await client.vault.withdraw({ vaultId, shares: 500_000n });
console.log('withdraw tx:', sig2);
```

If your on-chain account schema differs from the defaults, you can override the decoder:

```ts
import type { VaultState } from 'laserium-sdk';
import type { PublicKey } from '@solana/web3.js';

client.vault.configure({
	decodeVaultState: (raw: unknown, _vaultPda: PublicKey, vaultId: PublicKey): VaultState => {
		// Map `raw` → `VaultState` to match your IDL/account layout
		throw new Error('implement me');
	}
});
```

## Swap (oracle-priced)

### Quote

```ts
import { PublicKey } from '@solana/web3.js';

const fromMint = new PublicKey('FROM_MINT_BASE58');
const toMint = new PublicKey('TO_MINT_BASE58');

const quote = await client.swap.getQuote({
	from: fromMint,
	to: toMint,
	amount: 1_000_000n,
	slippageBps: 50,
	feeBps: 10,
	spreadBps: 0
});

console.log({
	in: quote.inAmount.toString(),
	out: quote.outAmount.toString(),
	minOut: quote.minOutAmount.toString(),
	priceExpo: quote.priceExpo
});
```

### Execute swap (requires `LaseriumClient`)

```ts
const sig = await client.swap.execute(quote);
console.log('swap tx:', sig);
```

## Yield routing

The yield router requires `YieldSource[]` (implemented by your app) so the SDK can compute an optimal route.

```ts
import type { YieldSource, YieldSourceMetrics } from 'laserium-sdk';
import type { PublicKey } from '@solana/web3.js';

class ExampleSource implements YieldSource {
	readonly id = 'example';

	async getMetrics(_assetMint: PublicKey): Promise<YieldSourceMetrics> {
		return {
			sourceId: this.id,
			aprBps: 800,
			liquidityUsd: 1_000_000,
			riskScore: 2,
			updatedAt: Math.floor(Date.now() / 1000)
		};
	}
}

client.yield.configure({
	sources: [new ExampleSource()],
	riskPenaltyBpsPerPoint: 50,
	minLiquidityUsd: 10_000

	// Optional:
	// maxSingleSourceBps: 7000,
	// decodeYieldState: (raw, vaultId) => ...
});

const route = await client.yield.getOptimalYieldRoute(SOL_MINT);
console.log(route);
```

On-chain rebalance (requires `LaseriumClient`):

```ts
const sig = await client.yield.rebalance(vaultId);
console.log('rebalance tx:', sig);
```

## Custom IDL names (optional)

If your IDL uses different instruction/account names than the SDK defaults, you can override them:

```ts
import { LaseriumReadonlyClient } from 'laserium-sdk';

const client = new LaseriumReadonlyClient({
	connection,
	programId,
	idl,
	oracleConfig,
	instructionNames: {
		deposit: 'deposit',
		withdraw: 'withdraw',
		oracleSwap: 'oracleSwap',
		rebalanceVault: 'rebalanceVault'
	},
	accountNames: {
		vault: 'vault',
		vaultAuthority: 'vaultAuthority',
		position: 'position',
		treasury: 'treasury',
		yieldRouter: 'yieldRouter'
	}
});
```

## Error handling

The SDK throws `LaseriumError` for categorized failures (stale oracle price, invalid arguments, etc.).

```ts
import { LaseriumError } from 'laserium-sdk';

try {
	await client.swap.getQuote({
		from: fromMint,
		to: toMint,
		amount: 1n,
		slippageBps: 50,
		feeBps: 10,
		spreadBps: 0
	});
} catch (e) {
	if (e instanceof LaseriumError) {
		console.error(e.code, e.message, e.details);
	}
	throw e;
}
```

## Development

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

## License

MIT
