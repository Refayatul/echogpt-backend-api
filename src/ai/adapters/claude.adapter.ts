import { BadGatewayException, Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResult,
  AiProviderAdapter,
} from './adapter.interface';
import { fetchUpstream } from './upstream.util';

const PROVIDER = 'Claude';
const BASE_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-5';
// Anthropic requires a max_tokens value on every request, so it always has a
// floor even when the caller does not specify one.
const DEFAULT_MAX_TOKENS = 1024;

@Injectable()
export class ClaudeAdapter implements AiProviderAdapter {
  readonly type = ProviderType.CLAUDE;

  async complete(
    apiKey: string,
    request: AiCompletionRequest,
  ): Promise<AiCompletionResult> {
    const body = await fetchUpstream(
      BASE_URL,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: request.model || DEFAULT_MODEL,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(request.temperature !== undefined
            ? { temperature: request.temperature }
            : {}),
          // Anthropic takes the system prompt as a top-level field rather than
          // as a message, and the remaining history in order.
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      },
      PROVIDER,
    );

    return this.toResult(body, request);
  }

  private toResult(
    body: unknown,
    request: AiCompletionRequest,
  ): AiCompletionResult {
    const data = body as {
      content?: { type?: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    // Only text blocks are meaningful; tool-use blocks are ignored.
    const text = (data.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');
    if (text.length === 0) {
      throw new BadGatewayException('Claude returned no content');
    }
    const input = data.usage?.input_tokens ?? 0;
    const output = data.usage?.output_tokens ?? 0;
    return {
      content: text,
      model: data.model ?? request.model ?? DEFAULT_MODEL,
      tokensUsed: input + output,
    };
  }
}
