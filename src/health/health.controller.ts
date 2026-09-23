import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  async check() {
    const databaseUp = await this.prisma.isHealthy();
    return {
      status: databaseUp ? 'ok' : 'error',
      database: databaseUp ? 'up' : 'down',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}