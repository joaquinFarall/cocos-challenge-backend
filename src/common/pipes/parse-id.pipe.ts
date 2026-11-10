import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const MAX_INT = 2147483647;

/** Path ids: `^[1-9]\d*$` and <= INT max; anything else is a 400 (ADR-02). */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^[1-9]\d*$/.test(value) || Number(value) > MAX_INT) {
      throw new BadRequestException(
        `id must be a positive integer up to ${MAX_INT}`,
      );
    }
    return Number(value);
  }
}
