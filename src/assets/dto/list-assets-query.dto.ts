import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const INT_MAX = 2147483647;
export const MAX_LIMIT = 100;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const strictInt = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;

export class ListAssetsQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive partial match on the asset name. Trimmed; blank is ignored. Max 255 chars.',
    example: 'banco',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Case-insensitive partial match on the ticker. Trimmed; blank is ignored. Max 255 chars.',
    example: 'pam',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  ticker?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: INT_MAX })
  @Transform(strictInt)
  @IsInt()
  @Min(1)
  @Max(INT_MAX)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: MAX_LIMIT })
  @Transform(strictInt)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = 20;
}
