import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageRole, ProviderType } from '@prisma/client';
import { AiAdapterRegistry } from '../ai/ai-adapter.registry';
import { AiMessage } from '../ai/adapters/adapter.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  ChatResponseDto,
  ConversationDetailDto,
  ConversationDto,
  SendMessageDto,
} from './dto/chat.dto';

// How many past messages are replayed to the provider as context. Bounded so a
// long conversation cannot grow the request without limit.
const HISTORY_TURNS = 20;
const TITLE_MAX_LENGTH = 60;
// Streaming replay size. Word boundaries are preserved so the client can
// concatenate chunks without inserting or losing whitespace.
const STREAM_CHUNK_WORDS = 6;

function chunkText(text: string): string[] {
  const words = text.split(/(\s+)/).filter((part) => part.length > 0);
  const chunks: string[] = [];
  let current = '';
  for (const part of words) {
    current += part;
    // Count only non-whitespace words toward the chunk size.
    if (part.trim().length > 0 && current.trim().split(/\s+/).length >= STREAM_CHUNK_WORDS) {
      chunks.push(current);
      current = '';
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
    private readonly subscriptions: SubscriptionsService,
    private readonly registry: AiAdapterRegistry,
    private readonly config: ConfigService,
  ) {}

  async send(userId: string, dto: SendMessageDto): Promise<ChatResponseDto> {
    // Quota is checked before the provider call so an over-limit user never
    // spends a paid upstream request.
    await this.subscriptions.consumeUsage(userId);

    const provider = await this.resolveProvider(userId, dto);
    const { conversationId, history } = await this.resolveConversation(
      userId,
      dto,
      provider.type,
    );

    const messages: AiMessage[] = [
      ...history.map((message) => ({
        role: message.role === MessageRole.ASSISTANT ? ('assistant' as const) : ('user' as const),
        content: message.content,
      })),
      { role: 'user' as const, content: dto.prompt },
    ];

    const result = this.isMockMode()
      ? await this.registry.getMock().complete('', {
          messages,
          model: provider.model,
          temperature: dto.temperature,
          maxTokens: dto.maxTokens,
        })
      : await this.registry.complete(
          provider.type,
          this.providers.decryptKey(provider),
          {
            messages,
            model: provider.model,
            temperature: dto.temperature,
            maxTokens: dto.maxTokens,
          },
        );

    await this.persistTurn(conversationId, dto.prompt, result.content, result.tokensUsed);

    return {
      conversationId,
      provider: provider.type,
      model: result.model,
      content: result.content,
      tokensUsed: result.tokensUsed ?? null,
    };
  }

  // Streaming variant of send(). The non-streaming adapters return the whole
  // completion at once, so the answer is replayed in word-sized chunks. This
  // keeps the client contract identical to a true token stream (and identical to
  // what swapping in a streaming upstream later would produce) without the
  // adapters needing two implementations.
  async *sendStreamed(
    userId: string,
    dto: SendMessageDto,
  ): AsyncGenerator<string, void, undefined> {
    const result = await this.send(userId, dto);
    for (const chunk of chunkText(result.content)) {
      yield chunk;
    }
  }

  async listConversations(userId: string): Promise<ConversationDto[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return conversations.map((conversation) => ({
      id: conversation.id,
      provider: conversation.provider,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }));
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDetailDto> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return {
      id: conversation.id,
      provider: conversation.provider,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        tokensUsed: message.tokensUsed,
        createdAt: message.createdAt,
      })),
    };
  }

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const result = await this.prisma.conversation.deleteMany({
      where: { id: conversationId, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Conversation not found');
    }
  }

  private async resolveProvider(
    userId: string,
    dto: SendMessageDto,
  ): Promise<Awaited<ReturnType<ProvidersService['resolveForChat']>>> {
    if (dto.providerId) {
      return this.providers.resolveForChat(userId, dto.providerId);
    }
    if (dto.providerType) {
      // Query the user's own providers of that type directly, preferring the
      // default and then the most recently created.
      const provider = await this.prisma.aiProvider.findFirst({
        where: { userId, type: dto.providerType, isEnabled: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
      if (!provider) {
        throw new BadRequestException(
          `No enabled ${dto.providerType} provider is configured. Add one via POST /providers.`,
        );
      }
      return provider;
    }
    return this.providers.resolveForChat(userId);
  }

  private async resolveConversation(
    userId: string,
    dto: SendMessageDto,
    providerType: ProviderType,
  ): Promise<{ conversationId: string; history: { role: MessageRole; content: string }[] }> {
    if (dto.conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: dto.conversationId, userId },
      });
      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }
      const recent = await this.prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_TURNS,
      });
      // Reversed back into chronological order for the provider.
      return {
        conversationId: conversation.id,
        history: recent
          .reverse()
          .filter((message) => message.role !== MessageRole.SYSTEM)
          .map((message) => ({ role: message.role, content: message.content })),
      };
    }

    const conversation = await this.prisma.conversation.create({
      data: { userId, provider: providerType, title: this.deriveTitle(dto.prompt) },
    });
    return { conversationId: conversation.id, history: [] };
  }

  private async persistTurn(
    conversationId: string,
    prompt: string,
    answer: string,
    tokensUsed?: number,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.message.createMany({
        data: [
          { conversationId, role: MessageRole.USER, content: prompt },
          {
            conversationId,
            role: MessageRole.ASSISTANT,
            content: answer,
            tokensUsed: tokensUsed ?? null,
          },
        ],
      }),
      // updatedAt is bumped explicitly because createMany does not touch the
      // conversation row, and the list endpoint orders by it.
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  private deriveTitle(prompt: string): string {
    const flattened = prompt.replace(/\s+/g, ' ').trim();
    if (flattened.length <= TITLE_MAX_LENGTH) {
      return flattened;
    }
    return `${flattened.slice(0, TITLE_MAX_LENGTH - 1)}…`;
  }

  private isMockMode(): boolean {
    // In mock mode the stored key is never decrypted, so a placeholder or
    // missing key can never break a local demo.
    return this.config.get<string>('AI_MOCK_MODE') === 'true';
  }
}
