import { Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResult,
  AiProviderAdapter,
} from './adapters/adapter.interface';
import { ClaudeAdapter } from './adapters/claude.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { MockAiAdapter } from './adapters/mock.adapter';
import { OpenAiAdapter } from './adapters/openai.adapter';

// Maps a provider type to its adapter in one place. Adding a fourth provider
// means adding an adapter class and one line here; nothing else changes.
@Injectable()
export class AiAdapterRegistry {
  private readonly adapters: Map<ProviderType, AiProviderAdapter>;

  constructor(
    openai: OpenAiAdapter,
    claude: ClaudeAdapter,
    gemini: GeminiAdapter,
    private readonly mock: MockAiAdapter,
  ) {
    this.adapters = new Map<ProviderType, AiProviderAdapter>([
      [ProviderType.OPENAI, openai],
      [ProviderType.CLAUDE, claude],
      [ProviderType.GEMINI, gemini],
    ]);
  }

  get(type: ProviderType): AiProviderAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      // Unreachable while the ProviderType enum and the map stay in sync.
      throw new Error(`No adapter registered for provider type ${type}`);
    }
    return adapter;
  }

  getMock(): AiProviderAdapter {
    return this.mock;
  }

  complete(
    type: ProviderType,
    apiKey: string,
    request: AiCompletionRequest,
  ): Promise<AiCompletionResult> {
    return this.get(type).complete(apiKey, request);
  }
}
