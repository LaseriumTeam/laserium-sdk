export const LASERIUM_SEED_VERSION = 1 as const;

export const Seeds = {
  Vault: 'laserium:v1:vault',
  VaultAuthority: 'laserium:v1:vault_authority',
  Position: 'laserium:v1:position',
  YieldRouter: 'laserium:v1:yield_router',
  Treasury: 'laserium:v1:treasury'
} as const;

export type SeedName = keyof typeof Seeds;
