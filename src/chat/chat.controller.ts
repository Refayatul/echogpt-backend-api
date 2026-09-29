import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import {
  ChatResponseDto,
  ConversationDetailDto,
  ConversationDto,
  SendMessageDto,
} from './dto/chat.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @ApiOperation({ summary: 'Send a prompt and receive the AI response' })
  @ApiCreatedResponse({ type: ChatResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed or no provider configured' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 402, description: 'Daily plan limit reached' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  @ApiResponse({ status: 502, description: 'The AI provider returned an error' })
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendMessageDto,
  ): Promise<ChatResponseDto> {
    return this.chatService.send(user.id, dto);
  }

  @Post('messages/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a prompt and stream the response as plain text chunks',
  })
  @ApiOkResponse({
    description: 'Newline-delimited text chunks, then a blank line',
    schema: { type: 'string', example: 'A closure is a function\n\n' },
  })
  @ApiResponse({ status: 400, description: 'Validation failed or no provider configured' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 402, description: 'Daily plan limit reached' })
  @ApiResponse({ status: 502, description: 'The AI provider returned an error' })
  async sendMessageStream(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-accel-buffering', 'no');

    const stream = this.chatService.sendStreamed(user.id, dto);
    try {
      for await (const chunk of stream) {
        res.write(`${chunk}\n`);
      }
    } catch (error) {
      // Headers are already sent, so the error is reported in-band as a final
      // chunk rather than as an HTTP status the client would never see.
      const message = error instanceof Error ? error.message : 'Stream failed';
      res.write(`\n[ERROR] ${message}\n`);
    } finally {
      res.write('\n');
      res.end();
    }
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List conversation history' })
  @ApiOkResponse({ type: [ConversationDto] })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async listConversations(@CurrentUser() user: AuthUser): Promise<ConversationDto[]> {
    return this.chatService.listConversations(user.id);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get one conversation with all its messages' })
  @ApiOkResponse({ type: ConversationDetailDto })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async getConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetailDto> {
    return this.chatService.getConversation(user.id, id);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a conversation' })
  @ApiResponse({ status: 204, description: 'Conversation deleted' })
  @ApiNotFoundResponse({ description: 'Conversation not found' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async deleteConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.chatService.deleteConversation(user.id, id);
  }
}
