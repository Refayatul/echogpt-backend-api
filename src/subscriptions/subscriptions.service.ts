import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanName, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PlanDto,
  PlansDto,
  SubscriptionDto,
  SubscriptionStatusDto,
} from './dto/subscription.dto';
import { addUtcDays, startOfUtcDay } from './usage.util';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans(): Promise<PlansDto> {
    const plans = await this.prisma.plan.findMany({
      orderBy: { pricePerMonth: 'asc' },
    });
    return { plans: plans.map((plan) => this.toPlanDto(plan)) };
  }

  async getStatus(userId: string): Promise<SubscriptionStatusDto> {
    const { subscription, plan } = await this.resolveActive(userId);
    const today = startOfUtcDay();
    const counter = await this.prisma.usageCounter.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    const used = counter?.count ?? 0;
    return {
      subscription: this.toSubscriptionDto(subscription, plan),
      used,
      remaining: Math.max(0, plan.dailyLimit - used),
      dailyLimit: plan.dailyLimit,
      usageDate: today,
    };
  }

  async getRemaining(userId: string): Promise<{
    remaining: number;
    dailyLimit: number;
    used: number;
    usageDate: Date;
  }> {
    const status = await this.getStatus(userId);
    return {
      remaining: status.remaining,
      dailyLimit: status.dailyLimit,
      used: status.used,
      usageDate: status.usageDate,
    };
  }

  // Upgrade (FREE -> PREMIUM) and downgrade (PREMIUM -> FREE) are the same
  // operation: point the subscription at the other plan. The old row is marked
  // CANCELED so the history of plan changes survives, and a new ACTIVE row is
  // created rather than mutating the existing one.
  async changePlan(userId: string, planName: PlanName): Promise<SubscriptionDto> {
    const targetPlan = await this.prisma.plan.findUnique({
      where: { name: planName },
    });
    if (!targetPlan) {
      throw new NotFoundException(`Plan ${planName} does not exist`);
    }

    const { subscription, plan } = await this.prisma.$transaction(async (tx) => {
      const active = await tx.subscription.findFirst({
        where: { userId, status: SubscriptionStatus.ACTIVE },
      });

      if (active) {
        await tx.subscription.update({
          where: { id: active.id },
          data: { status: SubscriptionStatus.CANCELED, endsAt: new Date() },
        });
      }

      // When there is no active row the user is simply activating a plan, so a
      // new one is created. A user who registered and never changed plan (and
      // so has no row yet) is handled by the same path.
      const created = await tx.subscription.create({
        data: { userId, planId: targetPlan.id, status: SubscriptionStatus.ACTIVE },
      });

      return { subscription: created, plan: targetPlan };
    });

    return this.toSubscriptionDto(subscription, plan);
  }

  async cancel(userId: string): Promise<SubscriptionDto> {
    const { subscription, plan } = await this.resolveActive(userId);
    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.CANCELED, endsAt: new Date() },
    });
    return this.toSubscriptionDto(updated, plan);
  }

  // Consumes one unit of the caller's daily allowance. Called by the chat and
  // web-search services so the quota lives in exactly one place.
  async consumeUsage(userId: string): Promise<void> {
    const { plan } = await this.resolveActive(userId);
    const today = startOfUtcDay();

    const counter = await this.prisma.usageCounter.upsert({
      where: { userId_date: { userId, date: today } },
      create: { userId, date: today, count: 1 },
      update: { count: { increment: 1 } },
    });

    if (counter.count > plan.dailyLimit) {
      // Roll the increment back so a rejected call does not permanently consume
      // the user's remaining allowance for the day.
      await this.prisma.usageCounter.update({
        where: { id: counter.id },
        data: { count: { decrement: 1 } },
      });
      // Nest has no 402 helper, so the status is set explicitly. 402 (not 429)
      // because throttling is not the issue: the plan's quota is exhausted.
      throw new HttpException(
        `Daily limit of ${plan.dailyLimit} requests reached. Upgrade your plan to continue.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private async resolveActive(userId: string): Promise<{
    subscription: {
      id: string;
      status: SubscriptionStatus;
      startedAt: Date;
      endsAt: Date | null;
    };
    plan: { id: string; name: string; dailyLimit: number; pricePerMonth: number };
  }> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      include: { plan: true },
      orderBy: { startedAt: 'desc' },
    });

    if (!subscription) {
      // A user who has never chosen a plan is on FREE. Rather than making every
      // caller special-case that, the default row is created on first use, so
      // the status, remaining and chat endpoints all behave for a brand-new
      // account.
      const freePlan = await this.prisma.plan.findUnique({
        where: { name: PlanName.FREE },
      });
      if (!freePlan) {
        throw new NotFoundException('FREE plan is missing; run the seed script');
      }
      const created = await this.prisma.subscription.create({
        data: { userId, planId: freePlan.id, status: SubscriptionStatus.ACTIVE },
        include: { plan: true },
      });
      return { subscription: created, plan: created.plan };
    }

    // An ACTIVE row whose end date has passed is treated as expired and is
    // closed here, so callers never see a stale allowance.
    if (subscription.endsAt && subscription.endsAt < new Date()) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.CANCELED },
        include: { plan: true },
      });
      throw new NotFoundException('Subscription has expired');
    }

    return { subscription, plan: subscription.plan };
  }

  private toPlanDto(plan: {
    id: string;
    name: string;
    dailyLimit: number;
    pricePerMonth: number;
  }): PlanDto {
    return {
      id: plan.id,
      name: plan.name,
      dailyLimit: plan.dailyLimit,
      pricePerMonth: plan.pricePerMonth,
    };
  }

  private toSubscriptionDto(
    subscription: {
      id: string;
      status: SubscriptionStatus;
      startedAt: Date;
      endsAt: Date | null;
    },
    plan: { id: string; name: string; dailyLimit: number; pricePerMonth: number },
  ): SubscriptionDto {
    return {
      id: subscription.id,
      status: subscription.status,
      startedAt: subscription.startedAt,
      endsAt: subscription.endsAt,
      plan: this.toPlanDto(plan),
    };
  }
}

export { addUtcDays };
