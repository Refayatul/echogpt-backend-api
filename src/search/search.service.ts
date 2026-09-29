import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SearchHistoryDto,
  SearchHistoryItemDto,
  SearchQueryDto,
  SearchResponseDto,
  SearchResultDto,
  SearchSuggestionDto,
} from './dto/search.dto';
import { WebSearchClient } from './web-search.client';

// A cached result older than this is refetched. The default is 6 hours.
const DEFAULT_CACHE_TTL_MINUTES = 360;
const HISTORY_LIMIT = 50;
const RECENT_LIMIT = 10;
const SUGGESTION_LIMIT = 8;

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WebSearchClient,
    private readonly config: ConfigService,
  ) {}

  async search(userId: string, dto: SearchQueryDto): Promise<SearchResponseDto> {
    const query = this.normalize(dto.q);
    const limit = dto.limit ?? 5;
    const useCache = dto.useCache !== false;
    const queryHash = this.hashQuery(query, limit);

    if (useCache) {
      const cached = await this.findCached(userId, queryHash);
      if (cached) {
        return {
          query,
          // The column is a Prisma Json value, so it is narrowed through
          // unknown before being treated as the result array.
          results: cached.results as unknown as SearchResultDto[],
          cached: true,
          searchedAt: cached.createdAt,
        };
      }
    }

    const results = await this.client.search(query, limit);
    // The row is scoped to the user: one user's search never serves another
    // user's history entry.
    await this.prisma.webSearch.create({
      data: { userId, query, queryHash, results: results as unknown as Prisma.InputJsonValue },
    });

    return { query, results, cached: false, searchedAt: new Date() };
  }

  async history(userId: string): Promise<SearchHistoryDto> {
    const rows = await this.prisma.webSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    return { items: rows.map((row) => this.toHistoryItem(row)) };
  }

  async recent(userId: string): Promise<SearchHistoryDto> {
    const rows = await this.prisma.webSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
    });
    return { items: rows.map((row) => this.toHistoryItem(row)) };
  }

  // Suggestions are derived from the user's own past queries rather than an
  // external suggestion API, which keeps this working with no extra key.
  async suggestions(userId: string, prefix?: string): Promise<SearchSuggestionDto[]> {
    const rows = await this.prisma.webSearch.findMany({
      where: {
        userId,
        ...(prefix ? { query: { contains: prefix, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { query: true },
    });

    const seen = new Set<string>();
    const suggestions: SearchSuggestionDto[] = [];
    for (const row of rows) {
      const key = row.query.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      suggestions.push({ suggestion: row.query });
      if (suggestions.length >= SUGGESTION_LIMIT) {
        break;
      }
    }
    return suggestions;
  }

  async clearHistory(userId: string): Promise<void> {
    await this.prisma.webSearch.deleteMany({ where: { userId } });
  }

  private async findCached(userId: string, queryHash: string) {
    const minutes = Number(
      this.config.get<string>('SEARCH_CACHE_TTL_MINUTES') ?? DEFAULT_CACHE_TTL_MINUTES,
    );
    const ttl = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_CACHE_TTL_MINUTES;
    const cutoff = new Date(Date.now() - ttl * 60_000);
    return this.prisma.webSearch.findFirst({
      where: { userId, queryHash, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private normalize(query: string): string {
    const collapsed = query.replace(/\s+/g, ' ').trim();
    return collapsed.toLowerCase();
  }

  // The limit is part of the hash so a 5-result and a 10-result search of the
  // same query do not share a cache entry.
  private hashQuery(query: string, limit: number): string {
    return createHash('sha256').update(`${query}|${limit}`).digest('hex');
  }

  private toHistoryItem(row: {
    id: string;
    query: string;
    results: unknown;
    createdAt: Date;
  }): SearchHistoryItemDto {
    const results = Array.isArray(row.results) ? (row.results as SearchResultDto[]) : [];
    return {
      id: row.id,
      query: row.query,
      resultCount: results.length,
      createdAt: row.createdAt,
    };
  }
}
