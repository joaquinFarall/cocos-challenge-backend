import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { AssetsService } from './assets.service';
import { AssetsPageDto } from './dto/assets-page.dto';
import { ListAssetsQueryDto } from './dto/list-assets-query.dto';

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @ApiOperation({
    summary: 'Search assets by name and/or ticker',
    description:
      'Case-insensitive partial match (accents are not handled). Name and ticker combine with AND. ARS is excluded. Sorted by ticker. A page past the end returns an empty `data` with the real `total`.',
  })
  @ApiOkResponse({ type: AssetsPageDto })
  @ApiBadRequestResponse({
    description: 'Unknown query param, or invalid name, ticker, page or limit',
    type: ErrorResponseDto,
  })
  list(@Query() query: ListAssetsQueryDto): Promise<AssetsPageDto> {
    return this.assets.list(query);
  }
}
