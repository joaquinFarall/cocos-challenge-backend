import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiProperty({ example: 'price' })
  field: string;

  @ApiProperty({ example: 'price must have at most 2 decimals' })
  message: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  status_code: number;

  @ApiProperty({ description: 'Machine-readable code', example: 'BAD_REQUEST' })
  error: string;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiPropertyOptional({
    type: [ErrorDetailDto],
    description: 'Per-field problems, only on validation errors',
  })
  details?: ErrorDetailDto[];
}
