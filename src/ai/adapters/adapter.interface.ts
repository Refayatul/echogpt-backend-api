import { ProviderType } from '@prisma/client';

// One message as the adapters see it. Kept provider-neutral so the chat service
// can hand the same history to any adapter.
export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  messages: AiMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiCompletionResult {
  content: string;
  model: string;
  tokensUsed?: number;
}

export interface AiProviderAdapter {
  readonly type: ProviderType;
  complete(apiKey: string, request: AiCompletionRequest): Promise<AiCompletionResult>;
}

// Every adapter shares these upstream failure modes, so they are modelled once
// and translated into HTTP errors in one place (see upstream-error.util).
export type UpstreamFailure =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'bad_request'
  | 'unavailable'
  | 'unknown';
