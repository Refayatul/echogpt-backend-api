import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { EncryptionUtil } from '../common/utils/encryption.util';
import { PrismaModule } from '../prisma/prisma.module';
import { ProvidersController } from './providers.controller';
import { ENCRYPTION_KEY, ProvidersService } from './providers.service';

@Module({
  imports: [AiModule, ConfigModule, PrismaModule],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    // EncryptionUtil takes a plain string key, so it is built from config here
    // and injected by token rather than constructed inside the service.
    {
      provide: ENCRYPTION_KEY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new EncryptionUtil(config.getOrThrow<string>('ENCRYPTION_KEY')),
    },
  ],
  // The chat and web-search modules need to resolve a provider and read its key.
  exports: [ProvidersService],
})
export class ProvidersModule {}
