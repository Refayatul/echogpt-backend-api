import { HttpException, HttpStatus } from '@nestjs/common';
import { PlanName, SubscriptionStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';
import { startOfUtcDay } from './usage.util';

const FREE_PLAN = {
  id: 'plan-free',
  name: PlanName.FREE,
  dailyLimit: 20,
  pricePerMonth: 0,
};
const PREMIUM_PLAN = {
  id: 'plan-premium',
  name: PlanName.PREMIUM,
  dailyLimit: 500,
  pricePerMonth: 999,
};

function activeSubscription(plan = FREE_PLAN) {
  return {
    id: 'sub-1',
    status: SubscriptionStatus.ACTIVE,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    endsAt: null,
    plan,
  };
}

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: {
    plan: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    subscription: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    usageCounter: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      plan: { findMany: vi.fn(), findUnique: vi.fn() },
      subscription: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      usageCounter: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn((arg: unknown) =>
        // $transaction has two forms: an array of operations, or a callback
        // receiving a tx client. Both are supported so the same mock works for
        // either style of service method.
        typeof arg === 'function'
          ? (arg as (tx: unknown) => Promise<unknown>)({
              plan: prisma.plan,
              subscription: prisma.subscription,
              usageCounter: prisma.usageCounter,
            })
          : Promise.all(arg as unknown[]),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [SubscriptionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(SubscriptionsService);
  });

  describe('getStatus', () => {
    it('reports remaining requests for the current UTC day', async () => {
      prisma.subscription.findFirst.mockResolvedValue(activeSubscription());
      prisma.usageCounter.findUnique.mockResolvedValue({ count: 7 });

      const status = await service.getStatus('user-1');

      expect(status.used).toBe(7);
      expect(status.remaining).toBe(13);
      expect(status.dailyLimit).toBe(20);
      expect(status.usageDate).toEqual(startOfUtcDay());
    });

    it('grants the FREE plan to a user who has no subscription yet', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.plan.findUnique.mockResolvedValue(FREE_PLAN);
      prisma.subscription.create.mockResolvedValue(activeSubscription());
      prisma.usageCounter.findUnique.mockResolvedValue(null);

      const status = await service.getStatus('user-1');

      expect(status.dailyLimit).toBe(20);
      expect(prisma.plan.findUnique).toHaveBeenCalledWith({
        where: { name: PlanName.FREE },
      });
    });
  });

  describe('consumeUsage', () => {
    it('increments the counter when under the limit', async () => {
      prisma.subscription.findFirst.mockResolvedValue(activeSubscription());
      prisma.usageCounter.upsert.mockResolvedValue({ id: 'counter-1', count: 3 });

      await expect(service.consumeUsage('user-1')).resolves.toBeUndefined();
      expect(prisma.usageCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_date: { userId: 'user-1', date: startOfUtcDay() } },
          update: { count: { increment: 1 } },
        }),
      );
    });

    it('rejects with 402 and rolls back the increment when over the limit', async () => {
      prisma.subscription.findFirst.mockResolvedValue(activeSubscription());
      prisma.usageCounter.upsert.mockResolvedValue({ id: 'counter-1', count: 21 });

      const error = await service.consumeUsage('user-1').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      // The over-limit increment must not consume the user's allowance.
      expect(prisma.usageCounter.update).toHaveBeenCalledWith({
        where: { id: 'counter-1' },
        data: { count: { decrement: 1 } },
      });
    });
  });

  describe('changePlan', () => {
    it('cancels the previous subscription and activates the new plan', async () => {
      prisma.plan.findUnique.mockResolvedValue(PREMIUM_PLAN);
      prisma.subscription.findFirst.mockResolvedValue(activeSubscription());
      prisma.subscription.update.mockResolvedValue({});
      prisma.subscription.create.mockResolvedValue({
        id: 'sub-2',
        status: SubscriptionStatus.ACTIVE,
        startedAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: null,
      });

      const result = await service.changePlan('user-1', PlanName.PREMIUM);

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: expect.objectContaining({ status: SubscriptionStatus.CANCELED }),
        }),
      );
      expect(result.plan.name).toBe(PlanName.PREMIUM);
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  describe('cancel', () => {
    it('marks the active subscription as canceled', async () => {
      prisma.subscription.findFirst.mockResolvedValue(activeSubscription());
      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        status: SubscriptionStatus.CANCELED,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2026-06-01T00:00:00.000Z'),
      });

      const result = await service.cancel('user-1');

      expect(result.status).toBe(SubscriptionStatus.CANCELED);
    });
  });
});
