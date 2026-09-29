import { BadGatewayException, Injectable } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import {
  AiCompletionRequest,
  AiCompletionResult,
  AiProviderAdapter,
} from './adapter.interface';
import { fetchUpstream } from './upstream.util';

const PROVIDER = 'Gemini';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';

@Injectable()
export class GeminiAdapter implements AiProviderAdapter {
  readonly type = ProviderType.GEMINI;

  async complete(
    apiKey: string,
    request: AiCompletionRequest,
  ): Promise<AiCompletionResult> {
    const model = request.model || DEFAULT_MODEL;
    // generationConfig is a single object; build it first so the optional
    // fields cannot collide into a duplicated JSON key.
    const generationConfig: { temperature?: number; maxOutputTokens?: number } = {};
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxTokens;
    }

    const body = await fetchUpstream(
      `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Gemini accepts the key via the x-goog-api-key header, which keeps it
          // out of URLs, logs and referrers.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: request.messages.map((message) => ({
            // Gemini calls the assistant role "model", not "assistant".
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
          ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
        }),
      },
      PROVIDER,
    );

    return this.toResult(body, model);
  }

  private toResult(body: unknown, model: string): AiCompletionResult {
    const data = body as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
      usageMetadata?: { totalTokenCount?: number };
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const content = parts
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    if (content.length === 0) {
      // A candidate can be present but hold no text when the prompt was blocked
      // by a safety filter, which is a client-side problem rather than a fault.
      if (data.candidates?.[0]?.finishReason) {
        throw new BadGatewayException(
          `Gemini returned no content (finish reason: ${data.candidates[0].finishReason})`,
        );
      }
      throw new BadGatewayException('Gemini returned no content');
    }
    return {
      content,
      model,
      tokensUsed: data.usageMetadata?.totalTokenCount,
    };
  }
}
