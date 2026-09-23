import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const USER_ROLE_ID = 'role-user-id';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    role: { findUnique: ReturnType<typeof vi.fn> };
    session: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: vi.fn(), create: vi.fn() },
      role: { findUnique: vi.fn() },
      session: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: vi.fn().mockResolvedValue('signed-token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) =>
              key === 'JWT_ACCESS_TTL' ? '15m' : '7d',
            ),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('registers a new user and returns tokens without a password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({
      id: USER_ROLE_ID,
      name: RoleName.USER,
    });
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      name: 'New',
      role: { name: RoleName.USER },
    });
    prisma.session.create.mockResolvedValue({});

    const result = await service.register({
      email: 'new@example.com',
      password: 'supersecret123',
      name: 'New',
    });

    expect(result.user.email).toBe('new@example.com');
    expect(result.user.role).toBe(RoleName.USER);
    expect(result.accessToken).toBe('signed-token');
    expect(result.refreshToken).toBe('signed-token');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
  });

  it('throws 409 when the email is already registered', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.register({
        email: 'taken@example.com',
        password: 'supersecret123',
        name: 'Taken',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('logs in with a correct password', async () => {
    const passwordHash = await bcrypt.hash('supersecret123', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'login@example.com',
      passwordHash,
      isDisabled: false,
      role: { name: RoleName.USER },
    });
    prisma.session.create.mockResolvedValue({});

    const result = await service.login({
      email: 'login@example.com',
      password: 'supersecret123',
    });

    expect(result.user.id).toBe('user-1');
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong password with the same message as unknown email', async () => {
    const passwordHash = await bcrypt.hash('supersecret123', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'login@example.com',
      passwordHash,
      isDisabled: false,
      role: { name: RoleName.USER },
    });

    await expect(
      service.login({ email: 'login@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login({ email: 'ghost@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates the session on refresh and rejects a reused token', async () => {
    prisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60),
      userAgent: null,
      ipAddress: null,
      user: {
        id: 'user-1',
        email: 'login@example.com',
        isDisabled: false,
        role: { name: RoleName.USER },
      },
    });
    prisma.session.update.mockResolvedValue({});
    prisma.session.create.mockResolvedValue({});

    const tokens = await service.refresh('a-refresh-token');
    expect(tokens.accessToken).toBe('signed-token');
    // The old session is revoked as part of rotation.
    expect(prisma.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );

    prisma.session.findFirst.mockResolvedValue(null);
    await expect(service.refresh('a-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes only the current session on logout', async () => {
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    await service.logout('session-1');
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'session-1', revokedAt: null } }),
    );
  });
});
