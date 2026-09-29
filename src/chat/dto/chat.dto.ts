import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProviderType } from '@prisma/client';

export class SendMessageDto {
  @ApiProperty({ example: 'Explain closures in one paragraph.' })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  prompt: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-0000-4000-8000-000000000001',
    description: 'Provider to use. Defaults to the user default provider.',
  })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({
    enum: ProviderType,
    description: 'Alternative to providerId: choose by provider type',
  })
  @IsOptional()
  providerType?: ProviderType;

  @ApiPropertyOptional({
    example: 'd5e6f7a8-0000-4000-8000-000000000001',
    description: 'Conversation to append to. Omit to start a new one.',
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({ example: 0.7, minimum: 0, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ example: 1024, minimum: 1, maximum: 8192 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  maxTokens?: number;
}

export class MessageDto {
  @ApiProperty({ example: 'e1f2a3b4-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ enum: ['USER', 'ASSISTANT', 'SYSTEM'] })
  role: string;

  @ApiProperty({ example: 'Explain closures in one paragraph.' })
  content: string;

  @ApiProperty({ example: 42, nullable: true })
  tokensUsed: number | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;
}

export class ConversationDto {
  @ApiProperty({ example: 'd5e6f7a8-0000-4000-8000-000000000001' })
  id: string;

  @ApiProperty({ enum: ProviderType })
  provider: ProviderType;

  @ApiProperty({ example: 'Closures explained', nullable: true })
  title: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-01T00:05:00.000Z' })
  updatedAt: Date;
}

export class ConversationDetailDto extends ConversationDto {
  @ApiProperty({ type: [MessageDto] })
  messages: MessageDto[];
}

export class ChatResponseDto {
  @ApiProperty({ example: 'd5e6f7a8-0000-4000-8000-000000000001' })
  conversationId: string;

  @ApiProperty({ enum: ProviderType })
  provider: ProviderType;

  @ApiProperty({ example: 'gemini-2.5-flash' })
  model: string;

  @ApiProperty({ example: 'A closure is a function bundled with its lexical environment.' })
  content: string;

  @ApiProperty({ example: 42, nullable: true })
  tokensUsed: number | null;
}
