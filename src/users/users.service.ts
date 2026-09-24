import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ProfileDto } from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<ProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name },
      include: { role: true },
    });
    return this.toProfile(user);
  }

  async changePassword(
    userId: string,
    sessionId: string,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      // Revoke every session except the one making the change, so a leaked
      // session on another device cannot keep using the old password.
      this.prisma.session.updateMany({
        where: { userId, id: { not: sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async deleteAccount(userId: string): Promise<void> {
    // Soft delete: the account is disabled and marked unverified, but the row
    // is kept for audit and foreign-key integrity. Sessions are all revoked.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { isDisabled: true, emailVerified: false },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private toProfile(user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    isDisabled: boolean;
    createdAt: Date;
    role: { name: string };
  }): ProfileDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      emailVerified: user.emailVerified,
      isDisabled: user.isDisabled,
      createdAt: user.createdAt,
    };
  }
}