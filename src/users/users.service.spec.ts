import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    session: { updateMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: vi.fn(), update: vi.fn() },
      session: { updateMany: vi.fn() },
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('returns a profile without password or token fields', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      emailVerified: true,
      isDisabled: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      role: { name: RoleName.USER },
    });

    const profile = await service.getProfile('user-1');

    expect(profile.role).toBe(RoleName.USER);
    expect(Object.keys(profile)).not.toContain('passwordHash');
    expect(Object.keys(profile)).not.toContain('emailVerificationTokenHash');
  });

  it('throws 404 when the user is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getProfile('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a wrong current password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash });

    await expect(
      service.changePassword('user-1', 'session-1', {
        currentPassword: 'wrong',
        newPassword: 'new-password-123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reusing the current password as the new one', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash });

    await expect(
      service.changePassword('user-1', 'session-1', {
        currentPassword: 'correct-password',
        newPassword: 'correct-password',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // The password must not be rewritten when the new value is the old one.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('changes the password and revokes sessions other than the current one', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash });
    prisma.user.update.mockResolvedValue({});
    prisma.session.updateMany.mockResolvedValue({ count: 1 });

    await service.changePassword('user-1', 'session-1', {
      currentPassword: 'correct-password',
      newPassword: 'new-password-123',
    });

    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', id: { not: 'session-1' }, revokedAt: null },
      }),
    );
  });

  it('soft-deletes by anonymizing the account and revoking sessions', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.user.update.mockResolvedValue({});
    prisma.session.updateMany.mockResolvedValue({ count: 2 });

    await service.deleteAccount('user-1');

    // The email is freed by anonymizing it, so the original address can be
    // registered again by a new account.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDisabled: true,
          emailVerified: false,
          email: 'deleted-user-1@deleted.invalid',
          name: 'Deleted User',
        }),
      }),
    );
    expect(prisma.session.updateMany).toHaveBeenCalledTimes(1);
  });

  it('replaces the password hash on delete so the old one stops working', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.user.update.mockResolvedValue({});
    prisma.session.updateMany.mockResolvedValue({ count: 0 });

    await service.deleteAccount('user-1');

    const { data } = prisma.user.update.mock.calls[0][0];
    // A random value, so it is not comparable to any real password hash.
    expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });
});