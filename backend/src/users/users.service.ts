import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from './role.enum.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { UserQueryDto } from './dto/user-query.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findAll(query: UserQueryDto) {
    const where: any = {};
    if (query.role) where.role = query.role;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  async updateRole(id: string, dto: UpdateRoleDto, requesterId: string) {
    const user = await this.findOne(id);
    if (requesterId === id && dto.role !== Role.ADMIN) {
      throw new ForbiddenException('Cannot demote yourself');
    }
    return this.prisma.user.update({ where: { id }, data: { role: dto.role } });
  }

  async remove(id: string, requesterId: string) {
    if (requesterId === id) {
      throw new ForbiddenException('Cannot delete yourself');
    }
    await this.findOne(id);
    return this.prisma.user.delete({ where: { id } });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email already in use');
      }
    }
    return this.prisma.user.update({ where: { id: userId }, data: dto });
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const key = `avatars/${userId}.${this.getExtension(file)}`;
    const user = await this.findOne(userId);

    if (user.avatarKey) {
      await this.storage.delete(user.avatarKey);
    }

    await this.storage.upload(file.buffer, key, file.mimetype);
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: key },
    });
  }

  async deleteAvatar(userId: string) {
    const user = await this.findOne(userId);
    if (!user.avatarKey) {
      throw new BadRequestException('No avatar to delete');
    }
    await this.storage.delete(user.avatarKey);
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: null },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.findOne(userId);
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async deleteAccount(userId: string) {
    const user = await this.findOne(userId);
    if (user.avatarKey) {
      await this.storage.delete(user.avatarKey);
    }
    return this.prisma.user.delete({ where: { id: userId } });
  }

  private getExtension(file: Express.Multer.File): string {
    const fromName = file.originalname?.split('.');
    if (fromName && fromName.length > 1) return fromName[fromName.length - 1];
    const mimeMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png',
      'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
    };
    return mimeMap[file.mimetype] ?? 'png';
  }
}
