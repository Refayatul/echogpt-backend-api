import { Injectable, NotFoundException } from '@nestjs/common';
import { RoleName, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { startOfUtcDay } from '../subscriptions/usage.util';
import {
  AdminProviderDto,
  AdminSubscriptionDto,
  AdminUserDto,
  AdminUserListDto,
  DashboardStatsDto,
  RequestLogDto,
  RequestLogListDto,
  SystemHealthDto,
  UsageAnalyticsDto,
  UsagePointDto,
} from './dto/admin.dto';

const MAX_PAGE_SIZE = 100;
const ANALYTICS_DAYS = 30;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(): Promise<DashboardStatsDto> {
    const [
      totalUsers,
      activeUsers,
      premiumUsers,
      conversations,
      webSearches,
      providerCount,
      totalRequests,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isDisabled: false } }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.ACTIVE, plan: { name: 'PREMIUM' } },
      }),
      this.prisma.conversation.count(),
      this.prisma.webSearch.count(),
      // Template rows created by the seed have an empty key, so they are not
      // counted as configured providers.
      this.prisma.aiProvider.count({ where: { apiKeyCipher: { not: '' } } }),
      this.prisma.apiUsageLog.count(),
    ]);

    return {
      totalUsers,
      activeUsers,
      premiumUsers,
      conversations,
      webSearches,
      providerCount,
      totalRequests,
    };
  }

  async listUsers(page = 1, pageSize = 20): Promise<AdminUserListDto> {
    const size = this.clampPageSize(pageSize);
    const current = Math.max(1, page);
    const today = startOfUtcDay();

    const [users, total, counters] = await Promise.all([
      this.prisma.user.findMany({
        include: {
          role: true,
          subscriptions: {
            where: { status: SubscriptionStatus.ACTIVE },
            include: { plan: true },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (current - 1) * size,
        take: size,
      }),
      this.prisma.user.count(),
      this.prisma.usageCounter.groupBy({
        by: ['userId'],
        where: { date: today },
        // _count is requested explicitly; without it the grouped rows carry no
        // aggregate and the usage total could not be read.
        _count: { _all: true },
      }),
    ]);

    const usageByUser = new Map(
      counters.map((counter) => [counter.userId, counter._count._all]),
    );

    return {
      items: users.map(
        (user): AdminUserDto => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role.name,
          emailVerified: user.emailVerified,
          isDisabled: user.isDisabled,
          plan: user.subscriptions[0]?.plan.name ?? null,
          requestsToday: usageByUser.get(user.id) ?? 0,
          createdAt: user.createdAt,
        }),
      ),
      total,
      page: current,
      pageSize: size,
    };
  }

  async setUserRole(userId: string, role: RoleName): Promise<AdminUserDto> {
    const roleRow = await this.prisma.role.findUnique({ where: { name: role } });
    if (!roleRow) {
      throw new NotFoundException(`Role ${role} does not exist`);
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { roleId: roleRow.id },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      emailVerified: user.emailVerified,
      isDisabled: user.isDisabled,
      plan: null,
      requestsToday: 0,
      createdAt: user.createdAt,
    };
  }

  async disableUser(userId: string, isDisabled: boolean): Promise<void> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { isDisabled },
    });
    if (result.count === 0) {
      throw new NotFoundException('User not found');
    }
    if (isDisabled) {
      // A disabled account must lose access immediately, so its live sessions
      // are revoked in the same operation.
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async listSubscriptions(): Promise<AdminSubscriptionDto[]> {
    const subscriptions = await this.prisma.subscription.findMany({
      include: { user: true, plan: true },
      orderBy: { startedAt: 'desc' },
      take: MAX_PAGE_SIZE,
    });
    return subscriptions.map((subscription) => ({
      id: subscription.id,
      userEmail: subscription.user.email,
      plan: subscription.plan.name,
      status: subscription.status,
      startedAt: subscription.startedAt,
      endsAt: subscription.endsAt,
    }));
  }

  async listProviders(): Promise<AdminProviderDto[]> {
    const providers = await this.prisma.aiProvider.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_PAGE_SIZE,
    });
    return providers.map((provider) => ({
      id: provider.id,
      userEmail: provider.user.email,
      type: provider.type,
      label: provider.label,
      model: provider.model,
      isEnabled: provider.isEnabled,
      // Only whether a key exists, never the key or its ciphertext.
      hasApiKey: provider.apiKeyCipher.length > 0,
      createdAt: provider.createdAt,
    }));
  }

  async usageAnalytics(days = ANALYTICS_DAYS): Promise<UsageAnalyticsDto> {
    const window = Math.min(Math.max(days, 1), 90);
    const since = new Date(Date.now() - window * 86_400_000);

    const [rows, aggregate] = await Promise.all([
      this.prisma.apiUsageLog.groupBy({
        by: ['createdAt'],
        where: { createdAt: { gte: since } },
      }),
      this.prisma.apiUsageLog.aggregate({
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _avg: { durationMs: true },
      }),
    ]);

    // groupBy returns exact timestamps, so requests are bucketed into UTC days
    // here to build a dense series with no gaps.
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const day = row.createdAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }

    const daily: UsagePointDto[] = [];
    for (let offset = window - 1; offset >= 0; offset -= 1) {
      const day = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
      daily.push({ date: day, requests: byDay.get(day) ?? 0 });
    }

    return {
      daily,
      totalRequests: aggregate._count._all,
      averageDurationMs: Math.round(aggregate._avg.durationMs ?? 0),
    };
  }

  async requestLogs(page = 1, pageSize = 50): Promise<RequestLogListDto> {
    const size = this.clampPageSize(pageSize);
    const current = Math.max(1, page);

    const [logs, total] = await Promise.all([
      this.prisma.apiUsageLog.findMany({
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip: (current - 1) * size,
        take: size,
      }),
      this.prisma.apiUsageLog.count(),
    ]);

    return {
      items: logs.map(
        (log): RequestLogDto => ({
          id: log.id,
          userEmail: log.user?.email ?? null,
          method: log.method,
          path: log.path,
          statusCode: log.statusCode,
          durationMs: log.durationMs,
          createdAt: log.createdAt,
        }),
      ),
      total,
      page: current,
      pageSize: size,
    };
  }

  async systemHealth(): Promise<SystemHealthDto> {
    const healthy = await this.prisma.isHealthy();
    const memory = process.memoryUsage();
    return {
      status: healthy ? 'UP' : 'DOWN',
      uptimeSeconds: Math.round(process.uptime()),
      prismaVersion: this.prisma.constructor.name,
      nodeVersion: process.version,
      memoryMb: Math.round(memory.rss / 1024 / 1024),
    };
  }

  private clampPageSize(pageSize: number): number {
    return Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  }
}
