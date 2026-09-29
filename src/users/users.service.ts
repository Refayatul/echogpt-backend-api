import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
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
    // PATCH {} is a no-op: only the fields actually supplied are written, so an
    // absent name does not get turned into a null or empty string.
    const data: { name?: string } = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
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

    // Reject reusing the current password. The comparison is done against the
    // stored hash rather than by string-comparing the plaintexts, so it is a
    // real bcrypt check and reveals nothing about the hash.
    const newMatches = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (newMatches) {
      throw new BadRequestException('New password must be different from the current one');
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
    // Soft delete: the row is kept for audit and foreign-key integrity, but the
    // personal data is anonymized so a deleted account is not still holding a
    // usable email address and name.
    //
    // Anonymizing (rather than only setting isDisabled) is also what lets the
    // address be re-registered: the original email is freed by the update.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          isDisabled: true,
          emailVerified: false,
          email: `deleted-${userId}@deleted.invalid`,
          name: 'Deleted User',
          // A random hash means the original password can no longer be
          // verified even if the user row were read directly.
          passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS),
        },
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