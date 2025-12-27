export type LaseriumErrorCode =
  | 'OraclePriceStale'
  | 'OracleConfidenceTooWide'
  | 'OracleAdapterUnavailable'
  | 'InvalidSlippage'
  | 'InvalidShareConversion'
  | 'VaultCapacityExceeded'
  | 'VaultInsolvent'
  | 'UnauthorizedAuthority'
  | 'ProgramNotConfigured'
  | 'AccountParseError'
  | 'InvariantViolation'
  | 'InvalidArgument'
  | 'TransactionBuildError';

export class LaseriumError extends Error {
  readonly code: LaseriumErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: LaseriumErrorCode,
    message: string,
    options?: { cause?: unknown; details?: Record<string, unknown> }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'LaseriumError';
    this.code = code;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}
