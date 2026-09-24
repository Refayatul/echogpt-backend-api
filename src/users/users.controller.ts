import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ProfileDto } from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiResponse({ status: 200, description: 'Profile returned', type: ProfileDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async getProfile(@CurrentUser() user: AuthUser): Promise<ProfileDto> {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated', type: ProfileDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileDto> {
    return this.usersService.updateProfile(user.id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('me/change-password')
  @ApiOperation({ summary: 'Change the password and revoke other sessions' })
  @ApiResponse({ status: 204, description: 'Password changed' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.usersService.changePassword(user.id, user.sessionId, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  @ApiOperation({ summary: 'Delete (disable) the current account' })
  @ApiResponse({ status: 204, description: 'Account deleted' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async deleteAccount(@CurrentUser() user: AuthUser): Promise<void> {
    await this.usersService.deleteAccount(user.id);
  }
}