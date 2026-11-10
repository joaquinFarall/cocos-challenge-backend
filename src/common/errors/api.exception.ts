import { HttpException } from '@nestjs/common';

export interface ErrorDetail {
  field: string;
  message: string;
}

export type DomainErrorCode =
  | 'USER_NOT_FOUND'
  | 'INSTRUMENT_NOT_FOUND'
  | 'SIDE_INSTRUMENT_MISMATCH'
  | 'NO_MARKET_DATA'
  | 'ZERO_SHARES'
  | 'SIZE_OUT_OF_RANGE';

export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: DomainErrorCode | 'BAD_REQUEST',
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message, status);
  }
}
