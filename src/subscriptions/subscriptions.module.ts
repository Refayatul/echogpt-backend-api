import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  // Exported so the chat and web-search modules can consume quota.
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
