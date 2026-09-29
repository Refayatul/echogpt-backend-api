import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from './search.service';
import { WebSearchClient } from './web-search.client';

const RESULTS = [{ title: 'NestJS', url: 'https://nestjs.com', snippet: 'A framework' }];

describe('SearchService', () => {
  let service: SearchService;
  let prisma: {
    webSearch: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };
  let client: { search: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      webSearch: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    client = { search: vi.fn().mockResolvedValue(RESULTS) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: WebSearchClient, useValue: client },
        { provide: ConfigService, useValue: { get: vi.fn().mockReturnValue(undefined) } },
      ],
    }).compile();

    service = moduleRef.get(SearchService);
  });

  it('calls the upstream search and stores the result on a cache miss', async () => {
    prisma.webSearch.findFirst.mockResolvedValue(null);

    const response = await service.search('user-1', { q: 'NestJS' });

    expect(response.cached).toBe(false);
    expect(response.results).toEqual(RESULTS);
    // The query is normalised so case and spacing do not fragment the cache.
    expect(prisma.webSearch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', query: 'nestjs' }),
      }),
    );
  });

  it('serves a fresh cache entry without calling upstream', async () => {
    prisma.webSearch.findFirst.mockResolvedValue({
      id: 'row-1',
      query: 'nestjs',
      results: RESULTS,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await service.search('user-1', { q: 'nestjs' });

    expect(response.cached).toBe(true);
    expect(response.results).toEqual(RESULTS);
    expect(client.search).not.toHaveBeenCalled();
    expect(prisma.webSearch.create).not.toHaveBeenCalled();
  });

  it('bypasses the cache when useCache is false', async () => {
    prisma.webSearch.findFirst.mockResolvedValue(null);

    await service.search('user-1', { q: 'nestjs', useCache: false });

    expect(prisma.webSearch.findFirst).not.toHaveBeenCalled();
    expect(client.search).toHaveBeenCalled();
  });

  it('gives a different cache key to a different result limit', async () => {
    prisma.webSearch.findFirst.mockResolvedValue(null);

    await service.search('user-1', { q: 'nestjs', limit: 5 });
    const first = prisma.webSearch.create.mock.calls[0][0].data.queryHash;
    await service.search('user-1', { q: 'nestjs', limit: 10 });
    const second = prisma.webSearch.create.mock.calls[1][0].data.queryHash;

    expect(first).not.toBe(second);
  });

  it('returns de-duplicated suggestions from past queries', async () => {
    prisma.webSearch.findMany.mockResolvedValue([
      { query: 'nestjs' },
      { query: 'NestJS' },
      { query: 'nestjs routing' },
    ]);

    const suggestions = await service.suggestions('user-1');

    expect(suggestions.map((s) => s.suggestion)).toEqual(['nestjs', 'nestjs routing']);
  });

  it('clears only the requesting user history', async () => {
    await service.clearHistory('user-1');
    expect(prisma.webSearch.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });
});
