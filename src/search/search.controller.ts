import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  SearchHistoryDto,
  SearchQueryDto,
  SearchResponseDto,
  SearchSuggestionDto,
} from './dto/search.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run a web search' })
  @ApiOkResponse({ type: SearchResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 502, description: 'The search provider returned an error' })
  async search(
    @CurrentUser() user: AuthUser,
    @Body() dto: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    return this.searchService.search(user.id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get the full search history' })
  @ApiOkResponse({ type: SearchHistoryDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async history(@CurrentUser() user: AuthUser): Promise<SearchHistoryDto> {
    return this.searchService.history(user.id);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get the most recent searches' })
  @ApiOkResponse({ type: SearchHistoryDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async recent(@CurrentUser() user: AuthUser): Promise<SearchHistoryDto> {
    return this.searchService.recent(user.id);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get search suggestions from previous queries' })
  @ApiQuery({ name: 'prefix', required: false, example: 'nes' })
  @ApiOkResponse({ type: [SearchSuggestionDto] })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async suggestions(
    @CurrentUser() user: AuthUser,
    @Query('prefix') prefix?: string,
  ): Promise<SearchSuggestionDto[]> {
    return this.searchService.suggestions(user.id, prefix);
  }

  @Delete('history')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear the search history' })
  @ApiResponse({ status: 204, description: 'History cleared' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async clearHistory(@CurrentUser() user: AuthUser): Promise<void> {
    await this.searchService.clearHistory(user.id);
  }
}
