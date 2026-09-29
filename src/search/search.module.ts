import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { WebSearchClient } from './web-search.client';

@Module({
  imports: [ConfigModule],
  controllers: [SearchController],
  providers: [SearchService, WebSearchClient],
})
export class SearchModule {}
