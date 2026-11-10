import {
  ValidationPipe,
  type ArgumentMetadata,
  type ValidationError,
} from '@nestjs/common';
import { ApiException, type ErrorDetail } from '../errors/api.exception';

function flatten(errors: ValidationError[], prefix = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = `${prefix}${error.property}`;
    return [
      ...Object.values(error.constraints ?? {}).map((message) => ({
        field,
        message,
      })),
      ...flatten(error.children ?? [], `${field}.`),
    ];
  });
}

export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new ApiException(
          400,
          'BAD_REQUEST',
          'Validation failed',
          flatten(errors),
        ),
    });
  }

  override async transform(value: unknown, metadata: ArgumentMetadata) {
    if (
      metadata.type === 'body' &&
      (typeof value !== 'object' || value === null || Array.isArray(value))
    ) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        'Request body must be a JSON object',
      );
    }
    return super.transform(value, metadata);
  }
}
