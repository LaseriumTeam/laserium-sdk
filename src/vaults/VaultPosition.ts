import type { PublicKey } from '@solana/web3.js';
import type { LaseriumReadonlyClient } from '../client/LaseriumReadonlyClient.js';
import { PDA } from '../accounts/PDA.js';
import { LaseriumError } from '../errors/LaseriumError.js';
import type { PositionState } from '../types/PositionState.js';

export type PositionAccountDecoder = (
  raw: unknown,
  positionPda: PublicKey,
  vaultId: PublicKey,
  owner: PublicKey
) => PositionState;

export class VaultPosition {
  constructor(
    readonly client: LaseriumReadonlyClient,
    readonly decodePositionState: PositionAccountDecoder
  ) {}

  async getPosition(vaultId: PublicKey, owner: PublicKey): Promise<PositionState | null> {
    const positionPda = PDA.position(this.client.programId, vaultId, owner).publicKey;

    // program.account.<name>.fetchNullable is not always available; use accountInfo check.
    const info = await this.client.connection.getAccountInfo(positionPda);
    if (!info) return null;

    const accountsNs = this.client.program.account as unknown as Record<
      string,
      { fetch: (pk: PublicKey) => Promise<unknown> }
    >;
    const positionAccount = accountsNs[this.client.accountNames.position];
    if (!positionAccount) {
      throw new LaseriumError('ProgramNotConfigured', 'Position account type not found on program', {
        details: { accountType: this.client.accountNames.position }
      });
    }
    const raw = await positionAccount.fetch(positionPda);
    return this.decodePositionState(raw, positionPda, vaultId, owner);
  }

  static defaultPositionDecoder(
    raw: unknown,
    positionPda: PublicKey,
    vaultId: PublicKey,
    owner: PublicKey
  ): PositionState {
    const obj = raw as Record<string, unknown>;

    const shares = obj['shares'];
    const sharesBig = (() => {
      if (typeof shares === 'bigint') return shares;
      if (typeof shares === 'number' && Number.isInteger(shares) && shares >= 0) return BigInt(shares);
      if (shares && typeof shares === 'object' && 'toString' in shares) {
        const s = String((shares as { toString: () => string }).toString());
        if (/^[0-9]+$/.test(s)) return BigInt(s);
      }
      throw new LaseriumError('AccountParseError', 'position.shares missing or invalid');
    })();

    const positionId = (() => {
      const maybe = obj['positionId'];
      if (maybe && typeof maybe === 'object' && 'toBase58' in maybe) return maybe as PublicKey;
      return positionPda;
    })();

    return {
      positionId,
      vaultId,
      owner,
      shares: sharesBig
    };
  }
}
