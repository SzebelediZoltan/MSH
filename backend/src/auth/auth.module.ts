import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type ms from 'ms';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { requiredEnv } from '../config/env.js';

@Module({
  imports: [
    JwtModule.register({
      secret: requiredEnv('JWT_SECRET'),
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as ms.StringValue,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
