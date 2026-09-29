import { BadGatewayException, HttpException, HttpStatus } from '@nestjs/common';
import { ProviderType } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeAdapter } from './claude.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { MockAiAdapter } from './mock.adapter';
import { OpenAiAdapter } from './openai.adapter';

const REQUEST = {
  messages: [{ role: 'user' as const, content: 'hi' }],
  model: 'test-model',
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('provider adapters', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('OpenAiAdapter', () => {
    it('sends the key in a header and reads choices[0]', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          choices: [{ message: { content: 'hello there' } }],
          usage: { total_tokens: 12 },
          model: 'gpt-4o-mini',
        }),
      );

      const result = await new OpenAiAdapter().complete('sk-test', REQUEST);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(init.headers.authorization).toBe('Bearer sk-test');
      // The key must never appear in the URL.
      expect(String(url)).not.toContain('sk-test');
      expect(result.content).toBe('hello there');
      expect(result.tokensUsed).toBe(12);
    });

    it('maps 401 to a 401 without leaking the upstream body', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'bad key sk-test' }, 401));

      const error = await new OpenAiAdapter()
        .complete('sk-test', REQUEST)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect((error as HttpException).message).not.toContain('sk-test');
    });

    it('maps 429 to a 429', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 429));
      const error = await new OpenAiAdapter()
        .complete('sk-test', REQUEST)
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('maps 500 to a 503', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 500));
      const error = await new OpenAiAdapter()
        .complete('sk-test', REQUEST)
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('reports a 502 when the response has no content', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ choices: [] }));
      await expect(new OpenAiAdapter().complete('sk-test', REQUEST)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('ClaudeAdapter', () => {
    it('sends x-api-key and an anthropic-version header', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          content: [{ type: 'text', text: 'hi from claude' }],
          usage: { input_tokens: 5, output_tokens: 7 },
          model: 'claude-sonnet-4-5',
        }),
      );

      const result = await new ClaudeAdapter().complete('sk-ant', REQUEST);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(init.headers['x-api-key']).toBe('sk-ant');
      expect(init.headers['anthropic-version']).toBe('2023-06-01');
      expect(result.content).toBe('hi from claude');
      expect(result.tokensUsed).toBe(12);
    });

    it('always sends max_tokens because the API requires it', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }),
      );
      await new ClaudeAdapter().complete('sk-ant', REQUEST);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.max_tokens).toBeGreaterThan(0);
    });

    it('ignores non-text content blocks', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          content: [
            { type: 'tool_use', id: 'x' },
            { type: 'text', text: 'only text' },
          ],
        }),
      );
      const result = await new ClaudeAdapter().complete('sk-ant', REQUEST);
      expect(result.content).toBe('only text');
    });
  });

  describe('GeminiAdapter', () => {
    it('sends the key in x-goog-api-key and maps roles to user/model', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: 'hi from gemini' }] } }],
          usageMetadata: { totalTokenCount: 9 },
        }),
      );

      const result = await new GeminiAdapter().complete('AIza-test', {
        messages: [
          { role: 'user', content: 'one' },
          { role: 'assistant', content: 'two' },
        ],
        model: 'gemini-2.5-flash',
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      );
      expect(init.headers['x-goog-api-key']).toBe('AIza-test');
      expect(String(url)).not.toContain('AIza-test');

      const body = JSON.parse(init.body);
      expect(body.contents[0].role).toBe('user');
      // Gemini names the assistant role "model".
      expect(body.contents[1].role).toBe('model');
      expect(result.content).toBe('hi from gemini');
      expect(result.tokensUsed).toBe(9);
    });

    it('emits a single generationConfig object when both options are set', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      );

      await new GeminiAdapter().complete('AIza-test', {
        ...REQUEST,
        temperature: 0.5,
        maxTokens: 100,
      });

      const raw = fetchMock.mock.calls[0][1].body;
      // A duplicated JSON key would survive JSON.parse silently, so the raw
      // string is checked too.
      expect(raw.match(/"generationConfig"/g)).toHaveLength(1);
      const body = JSON.parse(raw);
      expect(body.generationConfig).toEqual({ temperature: 0.5, maxOutputTokens: 100 });
    });

    it('mentions the finish reason when a candidate has no text', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] }),
      );
      await expect(
        new GeminiAdapter().complete('AIza-test', REQUEST),
      ).rejects.toThrow(/SAFETY/);
    });
  });

  describe('MockAiAdapter', () => {
    it('returns a clearly labelled response without any network call', async () => {
      const result = await new MockAiAdapter().complete('', REQUEST);
      expect(result.content).toContain('MOCK RESPONSE');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.tokensUsed).toBeGreaterThan(0);
    });
  });

  it('every adapter reports a distinct provider type', () => {
    expect(new OpenAiAdapter().type).toBe(ProviderType.OPENAI);
    expect(new ClaudeAdapter().type).toBe(ProviderType.CLAUDE);
    expect(new GeminiAdapter().type).toBe(ProviderType.GEMINI);
  });
});
