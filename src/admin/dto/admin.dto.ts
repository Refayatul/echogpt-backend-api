import { ApiProperty } from '@nestjs/swagger';
import { ProviderType, RoleName, SubscriptionStatus } from '@prisma/client';

export class DashboardStatsDto {
  @ApiProperty({ example: 128 })
  totalUsers: number;

  @ApiProperty({ example: 12 })
  activeUsers: number;

  @ApiProperty({ example: 3 })
  premiumUsers: number;

  @ApiProperty({ example: 45 })
  conversations: number;

  @ApiProperty({ example: 37 })
  webSearches: number;

  @ApiProperty({ example: 9 })
  providerCount: number;

  @ApiProperty({ example: 1420 })
  totalRequests: number;
}

export class AdminUserDto {
  @ApiProperty({ example: '3f6b2c1a-4d5e-4f7a-8b9c-0d1e2f3a4b5c' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'Ada' })
  name: string;

  @ApiProperty({ enum: RoleName })
  role: RoleName;

  @ApiProperty({ example: true })
  emailVerified: boolean;

  @ApiProperty({ example: false })
  isDisabled: boolean;

  @ApiProperty({ example: 'PREMIUM', nullable: true, enum: ['FREE', 'PREMIUM'] })
  plan: string | null;

  @ApiProperty({ example: 42 })
  requestsToday: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;
}

export class AdminUserListDto {
  @ApiProperty({ type: [AdminUserDto] })
  items: AdminUserDto[];

  @ApiProperty({ example: 128 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}

export class AdminProviderDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'user@example.com', description: 'Owner of the provider' })
  userEmail: string;

  @ApiProperty({ enum: ProviderType })
  type: ProviderType;

  @ApiProperty({ example: 'My Gemini account' })
  label: string;

  @ApiProperty({ example: 'gemini-2.5-flash' })
  model: string;

  @ApiProperty({ example: true })
  isEnabled: boolean;

  @ApiProperty({ example: true })
  hasApiKey: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;
}

export class AdminSubscriptionDto {
  @ApiProperty({ example: 'c2f0c0e2-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  userEmail: string;

  @ApiProperty({ enum: ['FREE', 'PREMIUM'] })
  plan: string;

  @ApiProperty({ enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  startedAt: Date;

  @ApiProperty({ example: null, nullable: true })
  endsAt: Date | null;
}

export class UsagePointDto {
  @ApiProperty({ example: '2026-01-01' })
  date: string;

  @ApiProperty({ example: 42, description: 'Requests logged on this day' })
  requests: number;
}

export class UsageAnalyticsDto {
  @ApiProperty({ type: [UsagePointDto] })
  daily: UsagePointDto[];

  @ApiProperty({ example: 1420 })
  totalRequests: number;

  @ApiProperty({ example: 128.4, description: 'Mean response duration in ms' })
  averageDurationMs: number;
}

export class RequestLogDto {
  @ApiProperty({ example: 'd6e7f8a9-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  userEmail: string | null;

  @ApiProperty({ example: 'GET' })
  method: string;

  @ApiProperty({ example: '/api/v1/chat/messages' })
  path: string;

  @ApiProperty({ example: 201 })
  statusCode: number;

  @ApiProperty({ example: 142 })
  durationMs: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;
}

export class RequestLogListDto {
  @ApiProperty({ type: [RequestLogDto] })
  items: RequestLogDto[];

  @ApiProperty({ example: 1420 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 50 })
  pageSize: number;
}

export class SystemHealthDto {
  @ApiProperty({ example: 'UP', enum: ['UP', 'DOWN'] })
  status: string;

  @ApiProperty({ example: 3.2 })
  uptimeSeconds: number;

  @ApiProperty({ example: '6.19.3' })
  prismaVersion: string;

  @ApiProperty({ example: '24.21.0' })
  nodeVersion: string;

  @ApiProperty({ example: 184 })
  memoryMb: number;
}
