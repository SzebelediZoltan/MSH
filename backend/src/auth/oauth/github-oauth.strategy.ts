import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-github2';
import { AuthService } from '../auth.service.js';

@Injectable()
export class GitHubOAuthStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      callbackURL: `${process.env.BACKEND_URL ?? 'http://localhost:3000'}/api/auth/github/callback`,
      scope: ['user:email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user?: unknown) => void,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('GitHub account has no email'), undefined);
    }

    const tokens = await this.authService.findOrCreateOAuthUser('github', {
      email,
      name: profile.displayName ?? profile.username ?? email.split('@')[0],
      avatarUrl: profile.photos?.[0]?.value ?? null,
    });

    done(null, tokens);
  }
}
