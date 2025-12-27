import { PublicKey } from '@solana/web3.js';
import { utf8Bytes } from '../utils/encoding.js';
import { Seeds } from './Seeds.js';

export type DerivedPda = { publicKey: PublicKey; bump: number };

function find(programId: PublicKey, seeds: Array<Buffer | Uint8Array>): DerivedPda {
  const [publicKey, bump] = PublicKey.findProgramAddressSync(seeds, programId);
  return { publicKey, bump };
}

export const PDA = {
  vault(programId: PublicKey, vaultId: PublicKey): DerivedPda {
    return find(programId, [utf8Bytes(Seeds.Vault), vaultId.toBuffer()]);
  },

  vaultAuthority(programId: PublicKey, vaultId: PublicKey): DerivedPda {
    return find(programId, [utf8Bytes(Seeds.VaultAuthority), vaultId.toBuffer()]);
  },

  position(programId: PublicKey, vaultId: PublicKey, owner: PublicKey): DerivedPda {
    return find(programId, [utf8Bytes(Seeds.Position), vaultId.toBuffer(), owner.toBuffer()]);
  },

  yieldRouter(programId: PublicKey): DerivedPda {
    return find(programId, [utf8Bytes(Seeds.YieldRouter)]);
  },

  treasury(programId: PublicKey): DerivedPda {
    return find(programId, [utf8Bytes(Seeds.Treasury)]);
  }
} as const;
