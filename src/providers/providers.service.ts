import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderType } from '@prisma/client';
import { AiAdapterRegistry } from '../ai/ai-adapter.registry';
import { EncryptionUtil } from '../common/utils/encryption.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';
import { ProviderDto, ProviderHealthDto } from './dto/provider-response.dto';

export const ENCRYPTION_KEY = 'ENCRYPTION_KEY';

type ProviderRow = {
  id: string;
  type: ProviderType;
  label: string;
  model: string;
  apiKeyCipher: string;
  apiKeyIv: string;
  apiKeyTag: string;
  isEnabled: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AiAdapterRegistry,
    @Inject(ENCRYPTION_KEY) private readonly encryption: EncryptionUtil,
    private readonly config: ConfigService,
  ) {}

  async list(userId: string): Promise<ProviderDto[]> {
    const providers = await this.prisma.aiProvider.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return providers.map((provider) => this.toDto(provider));
  }

  async get(userId: string, id: string): Promise<ProviderDto> {
    return this.toDto(await this.findOwned(userId, id));
  }

  async create(userId: string, dto: CreateProviderDto): Promise<ProviderDto> {
    const encrypted = this.encryption.encrypt(dto.apiKey);

    const provider = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        // Only one provider per user may be the default, so the flag is cleared
        // everywhere else inside the same transaction.
        await tx.aiProvider.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.aiProvider.create({
        data: {
          userId,
          type: dto.type,
          label: dto.label,
          model: dto.model,
          apiKeyCipher: encrypted.cipher,
          apiKeyIv: encrypted.iv,
          apiKeyTag: encrypted.tag,
          isEnabled: true,
          isDefault: dto.isDefault ?? false,
        },
      });
    });

    return this.toDto(provider);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateProviderDto,
  ): Promise<ProviderDto> {
    const existing = await this.findOwned(userId, id);

    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.apiKey !== undefined) {
      const encrypted = this.encryption.encrypt(dto.apiKey);
      data.apiKeyCipher = encrypted.cipher;
      data.apiKeyIv = encrypted.iv;
      data.apiKeyTag = encrypted.tag;
    }

    const provider = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.aiProvider.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
        data.isDefault = true;
      } else if (dto.isDefault === false && existing.isDefault) {
        // Clearing the default is allowed; the chat service then falls back to
        // the most recently created enabled provider.
        data.isDefault = false;
      }
      return tx.aiProvider.update({ where: { id: existing.id }, data });
    });

    return this.toDto(provider);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.findOwned(userId, id);
    await this.prisma.aiProvider.delete({ where: { id: existing.id } });
  }

  async setDefault(userId: string, id: string): Promise<ProviderDto> {
    const existing = await this.findOwned(userId, id);
    const provider = await this.prisma.$transaction(async (tx) => {
      await tx.aiProvider.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.aiProvider.update({
        where: { id: existing.id },
        data: { isDefault: true, isEnabled: true },
      });
    });
    return this.toDto(provider);
  }

  // A health check sends a deliberately tiny prompt so the cost is negligible.
  // It reports status only and never returns provider content.
  async healthCheck(userId: string, id: string): Promise<ProviderHealthDto> {
    const provider = await this.findOwned(userId, id);

    if (!provider.isEnabled) {
      return this.toHealth(provider, 'DISABLED', null, 'Provider is disabled');
    }
    if (!this.hasKey(provider)) {
      return this.toHealth(provider, 'NO_KEY', null, 'No API key stored');
    }

    const startedAt = Date.now();
    try {
      if (this.isMockMode()) {
        // Mock mode never reaches the network, so there is nothing real to
        // measure. It is reported as UP with no latency so a local demo of the
        // health endpoint still succeeds.
        return this.toHealth(provider, 'UP', null, null);
      }
      await this.registry.complete(provider.type, this.decryptKey(provider), {
        messages: [{ role: 'user', content: 'ping' }],
        model: provider.model,
        maxTokens: 16,
      });
      return this.toHealth(provider, 'UP', Date.now() - startedAt, null);
    } catch (error) {
      // Only the exception message is surfaced. It is produced by the adapter
      // layer from a status code, never from the raw upstream body, so it
      // cannot contain the API key.
      return this.toHealth(
        provider,
        'DOWN',
        Date.now() - startedAt,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  // Resolves the provider a chat request should use: an explicit id if given,
  // otherwise the user's default, otherwise their newest enabled provider.
  async resolveForChat(
    userId: string,
    providerId?: string,
  ): Promise<ProviderRow> {
    if (providerId) {
      const provider = await this.prisma.aiProvider.findFirst({
        where: { id: providerId, userId },
      });
      if (!provider) {
        throw new NotFoundException('Provider not found');
      }
      if (!provider.isEnabled) {
        throw new BadRequestException('Provider is disabled');
      }
      return provider;
    }

    const provider = await this.prisma.aiProvider.findFirst({
      where: { userId, isEnabled: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    if (!provider) {
      throw new BadRequestException(
        'No enabled AI provider is configured. Add one via POST /providers.',
      );
    }
    return provider;
  }

  decryptKey(provider: ProviderRow): string {
    return this.encryption.decrypt({
      cipher: provider.apiKeyCipher,
      iv: provider.apiKeyIv,
      tag: provider.apiKeyTag,
    });
  }

  hasKey(provider: ProviderRow): boolean {
    return (
      provider.apiKeyCipher.length > 0 &&
      provider.apiKeyIv.length > 0 &&
      provider.apiKeyTag.length > 0
    );
  }

  private async findOwned(userId: string, id: string): Promise<ProviderRow> {
    const provider = await this.prisma.aiProvider.findFirst({
      where: { id, userId },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  private toDto(provider: ProviderRow): ProviderDto {
    return {
      id: provider.id,
      type: provider.type,
      label: provider.label,
      model: provider.model,
      isEnabled: provider.isEnabled,
      isDefault: provider.isDefault,
      hasApiKey: this.hasKey(provider),
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private isMockMode(): boolean {
    return this.config.get<string>('AI_MOCK_MODE') === 'true';
  }

  private toHealth(
    provider: ProviderRow,
    status: string,
    latencyMs: number | null,
    detail: string | null,
  ): ProviderHealthDto {
    return { id: provider.id, type: provider.type, status, latencyMs, detail };
  }
}
