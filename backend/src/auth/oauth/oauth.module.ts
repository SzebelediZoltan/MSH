import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth.module.js';
import { GitHubOAuthStrategy } from './github-oauth.strategy.js';
import { GoogleOAuthStrategy } from './google-oauth.strategy.js';
import { OAuthController } from './oauth.controller.js';

@Module({
  imports: [PassportModule, AuthModule],
  controllers: [OAuthController],
  providers: [GoogleOAuthStrategy, GitHubOAuthStrategy],
})
export class OAuthModule {}
