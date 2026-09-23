import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Service and database health check' })
  @ApiResponse({ status: 200, description: 'Service is up' })
  @ApiResponse({ status: 503, description: 'Database is unreachable' })
  async check(@Res({ passthrough: true }) response: Response) {
    const databaseUp = await this.prisma.isHealthy();

    // Report 503 so orchestrators (and the compose healthcheck) see a failure
    // when the database is down, while still returning a readable body.
    response.status(databaseUp ? 200 : 503);

    return {
      status: databaseUp ? 'ok' : 'error',
      database: databaseUp ? 'up' : 'down',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}