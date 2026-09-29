import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  PlansDto,
  SubscriptionDto,
  SubscriptionStatusDto,
  UpgradeSubscriptionDto,
} from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List the available plans' })
  @ApiResponse({ status: 200, type: PlansDto })
  async listPlans(): Promise<PlansDto> {
    return this.subscriptionsService.listPlans();
  }

  @Get('status')
  @ApiOperation({ summary: 'Get the current subscription and its usage' })
  @ApiResponse({ status: 200, type: SubscriptionStatusDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'No active subscription' })
  async getStatus(@CurrentUser() user: AuthUser): Promise<SubscriptionStatusDto> {
    return this.subscriptionsService.getStatus(user.id);
  }

  @Get('remaining')
  @ApiOperation({ summary: 'Get the remaining requests for the current day' })
  @ApiResponse({
    status: 200,
    description: 'Remaining daily allowance',
    schema: {
      type: 'object',
      properties: {
        remaining: { type: 'number', example: 13 },
        dailyLimit: { type: 'number', example: 20 },
        used: { type: 'number', example: 7 },
        usageDate: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'No active subscription' })
  async getRemaining(
    @CurrentUser() user: AuthUser,
  ): Promise<{
    remaining: number;
    dailyLimit: number;
    used: number;
    usageDate: Date;
  }> {
    return this.subscriptionsService.getRemaining(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Upgrade or downgrade the subscription' })
  @ApiResponse({ status: 200, type: SubscriptionDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'Unknown plan' })
  async changePlan(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpgradeSubscriptionDto,
  ): Promise<SubscriptionDto> {
    return this.subscriptionsService.changePlan(user.id, dto.plan);
  }

  @HttpCode(HttpStatus.OK)
  @Post('cancel')
  @ApiOperation({ summary: 'Cancel the active subscription' })
  @ApiResponse({ status: 200, type: SubscriptionDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'No active subscription' })
  async cancel(@CurrentUser() user: AuthUser): Promise<SubscriptionDto> {
    return this.subscriptionsService.cancel(user.id);
  }
}
