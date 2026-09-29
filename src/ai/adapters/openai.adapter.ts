import { BadGatewayException, Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResult,
  AiProviderAdapter,
} from './adapter.interface';
import { fetchUpstream } from './upstream.util';

const PROVIDER = 'OpenAI';
const BASE_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

@Injectable()
export class OpenAiAdapter implements AiProviderAdapter {
  readonly type = ProviderType.OPENAI;

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
          // The key goes in a header, never in a query string, so it cannot
          // leak into proxy or server access logs.
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: request.model || DEFAULT_MODEL,
          messages: request.messages,
          ...(request.temperature !== undefined
            ? { temperature: request.temperature }
            : {}),
          ...(request.maxTokens !== undefined
            ? { max_tokens: request.maxTokens }
            : {}),
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
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
      model?: string;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new BadGatewayException('OpenAI returned no content');
    }
    return {
      content,
      model: data.model ?? request.model ?? DEFAULT_MODEL,
      tokensUsed: data.usage?.total_tokens,
    };
  }
}
