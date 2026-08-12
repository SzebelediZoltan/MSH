import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { SendVerifyCodeDto } from './dto/send-verify-code.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const code = this.generateCode();
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        verifyCode: code,
        verifyCodeExpiresAt: codeExpiresAt,
      },
    });

    await this.mailService.sendVerificationCode(user.email, code);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException('Email not verified');
    }

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<{ sub: string }>(refreshToken);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        avatarKey: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async sendVerifyCode(dto: SendVerifyCodeDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    const code = this.generateCode();
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verifyCode: code,
        verifyCodeExpiresAt: codeExpiresAt,
        verifyAttemptCount: 0,
      },
    });

    await this.mailService.sendVerificationCode(user.email, code);

    return { message: 'Verification code sent' };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    if (user.verifyAttemptCount >= 5) {
      throw new BadRequestException(
        'Too many failed attempts. Request a new code.',
      );
    }

    if (!user.verifyCode || !user.verifyCodeExpiresAt) {
      throw new BadRequestException(
        'No verification code found. Request a new one.',
      );
    }

    if (new Date() > user.verifyCodeExpiresAt) {
      throw new BadRequestException(
        'Verification code expired. Request a new one.',
      );
    }

    if (user.verifyCode !== dto.code) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { verifyAttemptCount: { increment: 1 } },
      });
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verifyCode: null,
        verifyCodeExpiresAt: null,
        verifyAttemptCount: 0,
      },
    });

    return this.generateTokens(user);
  }

  async findOrCreateOAuthUser(
    provider: 'google' | 'github',
    profile: { email: string; name: string; avatarUrl?: string | null },
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });
    if (existing) {
      return this.generateTokens(existing);
    }

    const placeholderHash = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      12,
    );

    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        passwordHash: placeholderHash,
        emailVerified: true,
      },
    });

    return this.generateTokens(user);
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  generateTokens(user: {
    id: string;
    email: string;
    name: string;
    role: string;
    emailVerified: boolean;
    avatarKey: string | null;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      refreshToken: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        avatarKey: user.avatarKey,
      },
    };
  }
}
