import { describe, expect, it } from 'vitest';

import { mulDiv, toBigIntAmount } from './utils/math.js';
import { PDA } from './accounts/PDA.js';
import { PublicKey } from '@solana/web3.js';

describe('smoke', () => {
  it('math.mulDiv behaves deterministically', () => {
    expect(mulDiv(10n, 3n, 2n)).toBe(15n);
    expect(toBigIntAmount('0')).toBe(0n);
  });

  it('PDA derivations are deterministic', () => {
    const programId = new PublicKey('11111111111111111111111111111111');
    const vaultId = new PublicKey('11111111111111111111111111111111');

    const a = PDA.vault(programId, vaultId).publicKey.toBase58();
    const b = PDA.vault(programId, vaultId).publicKey.toBase58();

    expect(a).toBe(b);
  });
});
