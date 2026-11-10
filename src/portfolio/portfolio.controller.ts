import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';
import { PortfolioResponseDto } from './dto/portfolio-response.dto';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolio')
@Controller('users')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get(':id/portfolio')
  @ApiOperation({
    summary: "A user's portfolio: total value, cash and positions",
    description:
      'Computed from the user’s FILLED and NEW orders. Yield is unrealized, against the weighted-average cost. Money and yield are decimal strings with 2 decimals.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'User id: positive integer up to 2147483647',
    example: 1,
  })
  @ApiOkResponse({ type: PortfolioResponseDto })
  @ApiBadRequestResponse({
    description: 'Malformed id',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'User not found',
    type: ErrorResponseDto,
  })
  get(@Param('id', ParseIdPipe) id: number): Promise<PortfolioResponseDto> {
    return this.portfolio.getPortfolio(id);
  }
}
