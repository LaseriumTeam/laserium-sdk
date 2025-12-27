import type { PublicKey } from '@solana/web3.js';
import { PDA } from './PDA.js';

export type VaultAuthorities = {
  vault: PublicKey;
  vaultAuthority: PublicKey;
};

export function deriveVaultAuthorities(programId: PublicKey, vaultId: PublicKey): VaultAuthorities {
  const vault = PDA.vault(programId, vaultId).publicKey;
  const vaultAuthority = PDA.vaultAuthority(programId, vaultId).publicKey;
  return { vault, vaultAuthority };
}
