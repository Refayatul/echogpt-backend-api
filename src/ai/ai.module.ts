import { Module } from '@nestjs/common';
import { AiAdapterRegistry } from './ai-adapter.registry';
import { ClaudeAdapter } from './adapters/claude.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { MockAiAdapter } from './adapters/mock.adapter';
import { OpenAiAdapter } from './adapters/openai.adapter';

@Module({
  providers: [
    OpenAiAdapter,
    ClaudeAdapter,
    GeminiAdapter,
    MockAiAdapter,
    AiAdapterRegistry,
  ],
  exports: [AiAdapterRegistry],
})
export class AiModule {}
