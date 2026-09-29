import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({ example: 'nestjs vs express' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  q: string;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Set false to force a fresh search and skip the cache',
  })
  @IsOptional()
  @IsBoolean()
  useCache?: boolean;
}

export class SearchResultDto {
  @ApiProperty({ example: 'NestJS' })
  title: string;

  @ApiProperty({ example: 'https://en.wikipedia.org/wiki/NestJS' })
  url: string;

  @ApiProperty({ example: 'NestJS is a server-side Node.js-based web framework.' })
  snippet: string;
}

export class SearchResponseDto {
  @ApiProperty({ example: 'nestjs vs express' })
  query: string;

  @ApiProperty({ type: [SearchResultDto] })
  results: SearchResultDto[];

  @ApiProperty({ example: true, description: 'Whether the results came from the cache' })
  cached: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  searchedAt: Date;
}

export class SearchHistoryItemDto {
  @ApiProperty({ example: 'e1f2a3b4-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'nestjs vs express' })
  query: string;

  @ApiProperty({ example: 5 })
  resultCount: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;
}

export class SearchHistoryDto {
  @ApiProperty({ type: [SearchHistoryItemDto] })
  items: SearchHistoryItemDto[];
}

export class SearchSuggestionDto {
  @ApiProperty({ example: 'nestjs vs express' })
  suggestion: string;
}
