import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';
import { ProviderDto, ProviderHealthDto } from './dto/provider-response.dto';
import { ProvidersService } from './providers.service';

@ApiTags('providers')
@ApiBearerAuth()
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user AI providers' })
  @ApiOkResponse({ type: [ProviderDto] })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async list(@CurrentUser() user: AuthUser): Promise<ProviderDto[]> {
    return this.providersService.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Add an AI provider' })
  @ApiCreatedResponse({ type: ProviderDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProviderDto,
  ): Promise<ProviderDto> {
    return this.providersService.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one AI provider' })
  @ApiOkResponse({ type: ProviderDto })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProviderDto> {
    return this.providersService.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an AI provider' })
  @ApiOkResponse({ type: ProviderDto })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<ProviderDto> {
    return this.providersService.update(user.id, id, dto);
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set an AI provider as the default' })
  @ApiOkResponse({ type: ProviderDto })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async setDefault(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProviderDto> {
    return this.providersService.setDefault(user.id, id);
  }

  @Get(':id/health')
  @ApiOperation({ summary: 'Check whether a provider is reachable' })
  @ApiOkResponse({ type: ProviderHealthDto })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async healthCheck(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProviderHealthDto> {
    return this.providersService.healthCheck(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an AI provider' })
  @ApiResponse({ status: 204, description: 'Provider deleted' })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.providersService.remove(user.id, id);
  }
}
