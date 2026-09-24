import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash, randomUUID } from 'crypto';
import type { SignOptions } from 'jsonwebtoken';
import { RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 12;

// A fixed hash used to keep login timing constant for unknown emails. The
// plaintext is not recorded anywhere; this value only needs to be a real hash.
const DUMMY_PASSWORD_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBp8Z0xYx7bHCJK5P1B2wq2Xo4jqLu';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  emailVerificationToken?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const userRole = await this.prisma.role.findUnique({
      where: { name: RoleName.USER },
    });
    if (!userRole) {
      throw new Error('USER role is missing; run the seed script');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Email verification is a bonus and is only stubbed: we create a token and
    // return it, but no email is sent. Only the hash is stored, and it expires.
    const emailVerificationToken = randomBytes(32).toString('hex');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        roleId: userRole.id,
        emailVerificationTokenHash: this.hashToken(emailVerificationToken),
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      include: { role: true },
    });

    const tokens = await this.issueTokens(
      user.id,
      user.email,
      user.role.name,
      undefined,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name,
      },
      emailVerificationToken,
    };
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    // Always run a bcrypt compare, even for an unknown email, so the response
    // time does not reveal whether the account exists.
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isDisabled) {
      throw new UnauthorizedException('Account is disabled');
    }

    const tokens = await this.issueTokens(
      user.id,
      user.email,
      user.role.name,
      { userAgent, ipAddress },
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name,
      },
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: tokenHash, revokedAt: null },
      include: { user: { include: { role: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.user.isDisabled) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Rotate atomically: only one request can revoke this exact token. Two
    // concurrent refreshes with the same token result in one success and one
    // 401, because the second updateMany matches zero rows.
    const rotated = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count !== 1) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(
      session.user.id,
      session.user.email,
      session.user.role.name,
      { userAgent: session.userAgent ?? undefined, ipAddress: session.ipAddress ?? undefined },
    );
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: { emailVerificationTokenHash: tokenHash },
    });

    if (!user || !user.emailVerificationExpiresAt) {
      throw new BadRequestException('Invalid verification token');
    }
    if (user.emailVerificationExpiresAt < new Date()) {
      throw new BadRequestException('Verification token has expired');
    }

    // One-time: clear the token so it cannot be used again.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens> {
    const sessionId = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, role, sessionId },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.ttl('JWT_ACCESS_TTL', '15m'),
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, sessionId },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.ttl('JWT_REFRESH_TTL', '7d'),
      },
    );

    // Only a hash of the refresh token is stored, so a database leak cannot be
    // used to mint new sessions.
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: this.hashToken(refreshToken),
        userAgent: meta?.userAgent ?? null,
        ipAddress: meta?.ipAddress ?? null,
        expiresAt: this.refreshExpiry(),
      },
    });

    return { accessToken, refreshToken };
  }

  private ttl(key: string, fallback: string): SignOptions['expiresIn'] {
    return (this.config.get<string>(key) ?? fallback) as SignOptions['expiresIn'];
  }

  private refreshExpiry(): Date {
    const ttl = this.config.get<string>('JWT_REFRESH_TTL') ?? '7d';
    const match = /^(\d+)([dhms])$/.exec(ttl);
    const now = Date.now();
    if (!match) {
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    }
    const value = Number(match[1]);
    const unitMs = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000 }[
      match[2] as 'd' | 'h' | 'm' | 's'
    ];
    return new Date(now + value * unitMs);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
