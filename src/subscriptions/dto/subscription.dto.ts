import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PlanName } from '@prisma/client';

export class PlanDto {
  @ApiProperty({ example: 'b1f0c0e2-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'FREE', enum: ['FREE', 'PREMIUM'] })
  name: string;

  @ApiProperty({ example: 20, description: 'Requests allowed per day' })
  dailyLimit: number;

  @ApiProperty({ example: 0, description: 'Price per month in the smallest currency unit' })
  pricePerMonth: number;
}

export class SubscriptionDto {
  @ApiProperty({ example: 'c2f0c0e2-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'CANCELED'] })
  status: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  startedAt: Date;

  @ApiProperty({ example: null, nullable: true })
  endsAt: Date | null;

  @ApiProperty({ type: PlanDto })
  plan: PlanDto;
}

export class SubscriptionStatusDto {
  @ApiProperty({ type: SubscriptionDto })
  subscription: SubscriptionDto;

  @ApiProperty({ example: 7 })
  used: number;

  @ApiProperty({ example: 13 })
  remaining: number;

  @ApiProperty({ example: 20 })
  dailyLimit: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z', description: 'UTC day the usage applies to' })
  usageDate: Date;
}

export class PlansDto {
  @ApiProperty({ type: [PlanDto] })
  plans: PlanDto[];
}

export class UpgradeSubscriptionDto {
  @ApiProperty({ example: 'PREMIUM', enum: ['FREE', 'PREMIUM'] })
  @IsIn([PlanName.FREE, PlanName.PREMIUM])
  plan: PlanName;
}
