import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import {
  AdminProviderDto,
  AdminSubscriptionDto,
  AdminUserDto,
  AdminUserListDto,
  DashboardStatsDto,
  RequestLogListDto,
  SystemHealthDto,
  UsageAnalyticsDto,
} from './dto/admin.dto';

class SetRoleDto {
  @ApiProperty({ enum: RoleName, example: RoleName.ADMIN })
  @IsEnum(RoleName)
  role: RoleName;
}

class SetDisabledDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  disabled: boolean;
}

// Every route in this controller is admin-only. RolesGuard reads the decorator
// and rejects non-admins with 403 before the handler runs.
@Roles(RoleName.ADMIN)
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard statistics' })
  @ApiOkResponse({ type: DashboardStatsDto })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  async stats(): Promise<DashboardStatsDto> {
    return this.adminService.dashboard();
  }

  @Get('users')
  @ApiOperation({ summary: 'List users with their plan and today usage' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20 })
  @ApiOkResponse({ type: AdminUserListDto })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  async listUsers(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ): Promise<AdminUserListDto> {
    return this.adminService.listUsers(page, pageSize);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: "Change a user's role" })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  async setRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto,
  ): Promise<AdminUserDto> {
    return this.adminService.setUserRole(id, dto.role);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Enable or disable a user' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'User updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDisabledDto,
  ): Promise<void> {
    await this.adminService.disableUser(id, dto.disabled);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'List subscriptions' })
  @ApiOkResponse({ type: [AdminSubscriptionDto] })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  async listSubscriptions(): Promise<AdminSubscriptionDto[]> {
    return this.adminService.listSubscriptions();
  }

  @Get('providers')
  @ApiOperation({ summary: 'List all AI providers across users' })
  @ApiOkResponse({ type: [AdminProviderDto] })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  async listProviders(): Promise<AdminProviderDto[]> {
    return this.adminService.listProviders();
  }

  @Get('usage')
  @ApiOperation({ summary: 'API usage analytics over time' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiOkResponse({ type: UsageAnalyticsDto })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  async usage(
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ): Promise<UsageAnalyticsDto> {
    return this.adminService.usageAnalytics(days);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Request logs' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 50 })
  @ApiOkResponse({ type: RequestLogListDto })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  async logs(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ): Promise<RequestLogListDto> {
    return this.adminService.requestLogs(page, pageSize);
  }

  @Get('health')
  @ApiOperation({ summary: 'System health' })
  @ApiOkResponse({ type: SystemHealthDto })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  async health(): Promise<SystemHealthDto> {
    return this.adminService.systemHealth();
  }
}
