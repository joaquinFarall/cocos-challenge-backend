import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiException, type ErrorDetail } from './api.exception';

export interface ErrorBody {
  status_code: number;
  error: string;
  message: string;
  details?: ErrorDetail[];
}

const INTERNAL: ErrorBody = {
  status_code: 500,
  error: 'INTERNAL_SERVER_ERROR',
  message: 'Internal server error',
};

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  return typeof message === 'string' ? message : exception.message;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = this.toBody(exception);
    this.httpAdapterHost.httpAdapter.reply(
      host.switchToHttp().getResponse(),
      body,
      body.status_code,
    );
  }

  private toBody(exception: unknown): ErrorBody {
    if (
      exception instanceof HttpException &&
      exception.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      const status = exception.getStatus();
      return {
        status_code: status,
        error:
          exception instanceof ApiException
            ? exception.code
            : (HttpStatus[status] ?? 'ERROR'),
        message: messageOf(exception),
        ...(exception instanceof ApiException && exception.details
          ? { details: exception.details }
          : {}),
      };
    }
    this.logger.error(exception);
    return INTERNAL;
  }
}
