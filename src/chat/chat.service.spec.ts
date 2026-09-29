import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiAdapterRegistry } from '../ai/ai-adapter.registry';
import { PrismaService } from '../prisma/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ChatService } from './chat.service';

const PROVIDER = {
  id: 'prov-1',
  userId: 'user-1',
  type: 'GEMINI' as never,
  label: 'Gemini',
  model: 'gemini-2.5-flash',
  apiKeyCipher: 'c',
  apiKeyIv: 'i',
  apiKeyTag: 't',
  isEnabled: true,
  isDefault: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('ChatService quota accounting', () => {
  let service: ChatService;
  let prisma: Record<string, unknown>;
  let providers: { resolveForChat: ReturnType<typeof vi.fn> };
  let subscriptions: { consumeUsage: ReturnType<typeof vi.fn> };
  let registry: { complete: ReturnType<typeof vi.fn>; getMock: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      aiProvider: { findFirst: vi.fn() },
      conversation: { create: vi.fn(), update: vi.fn() },
      message: { createMany: vi.fn(), findMany: vi.fn() },
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    };
    providers = { resolveForChat: vi.fn().mockResolvedValue(PROVIDER) };
    subscriptions = { consumeUsage: vi.fn().mockResolvedValue(undefined) };
    registry = {
      complete: vi
        .fn()
        .mockResolvedValue({ content: 'answer', model: 'm', tokensUsed: 3 }),
      getMock: vi.fn().mockReturnValue({
        complete: vi.fn().mockResolvedValue({ content: 'answer', model: 'm', tokensUsed: 3 }),
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProvidersService, useValue: providers },
        { provide: SubscriptionsService, useValue: subscriptions },
        { provide: AiAdapterRegistry, useValue: registry },
        { provide: ConfigService, useValue: { get: vi.fn().mockReturnValue('true') } },
      ],
    }).compile();

    service = moduleRef.get(ChatService);
  });

  it('consumes quota once for a successful message', async () => {
    (prisma.conversation as { create: ReturnType<typeof vi.fn> }).create.mockResolvedValue({
      id: 'conv-1',
    });

    await service.send('user-1', { prompt: 'hello' });

    expect(subscriptions.consumeUsage).toHaveBeenCalledTimes(1);
  });

  // Regression: quota used to be consumed before the provider was resolved, so a
  // request that could never succeed still cost the user one daily request.
  it('does NOT consume quota when the provider cannot be resolved', async () => {
    providers.resolveForChat.mockRejectedValue(
      new Error('No enabled AI provider is configured.'),
    );

    await expect(service.send('user-1', { prompt: 'hello' })).rejects.toThrow(
      'No enabled AI provider is configured.',
    );

    expect(subscriptions.consumeUsage).not.toHaveBeenCalled();
  });

  it('resolves the provider before consuming quota', async () => {
    const order: string[] = [];
    providers.resolveForChat.mockImplementation(async () => {
      order.push('resolveProvider');
      return PROVIDER;
    });
    subscriptions.consumeUsage.mockImplementation(async () => {
      order.push('consumeUsage');
    });
    (prisma.conversation as { create: ReturnType<typeof vi.fn> }).create.mockResolvedValue({
      id: 'conv-1',
    });

    await service.send('user-1', { prompt: 'hello' });

    expect(order).toEqual(['resolveProvider', 'consumeUsage']);
  });
});
