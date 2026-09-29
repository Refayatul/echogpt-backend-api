import { Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResult,
  AiProviderAdapter,
} from './adapter.interface';

// Used when AI_MOCK_MODE=true or a provider has no key stored, so the chat and
// search flows stay fully exercisable without calling a paid upstream API. It is
// clearly labelled in the response so a mock can never be mistaken for a real
// model answer.
@Injectable()
export class MockAiAdapter implements AiProviderAdapter {
  // The mock stands in for any provider, so it reports itself as MOCK rather
  // than claiming to be one of the real types.
  readonly type = 'MOCK' as ProviderType;

  async complete(
    _apiKey: string,
    request: AiCompletionRequest,
  ): Promise<AiCompletionResult> {
    const lastUserMessage = [...request.messages]
      .reverse()
      .find((message) => message.role === 'user');

    const prompt = lastUserMessage?.content ?? '(no prompt)';
    const content = [
      '[MOCK RESPONSE - no AI provider was called]',
      `Model: ${request.model || 'mock'}`,
      `Messages in context: ${request.messages.length}`,
      `You said: ${prompt}`,
    ].join('\n');

    // A crude token estimate, enough to populate the usage column.
    const tokensUsed = Math.ceil(content.length / 4);
    return { content, model: request.model || 'mock', tokensUsed };
  }
}
