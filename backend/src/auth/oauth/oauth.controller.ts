import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

@Controller('auth')
export class OAuthController {
  @Get('google')
  @UseGuards(AuthGuard('google'))
  google(): void {
    // Passport handlezi az átirányítást a Google-hez
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(
    @Req() req: { user?: OAuthTokens },
    @Res() res: Response,
  ): void {
    this.redirectWithTokens(req.user, res);
  }

  @Get('github')
  @UseGuards(AuthGuard('github'))
  github(): void {
    // Passport handlezi az átirányítást a GitHub-hoz
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  githubCallback(
    @Req() req: { user?: OAuthTokens },
    @Res() res: Response,
  ): void {
    this.redirectWithTokens(req.user, res);
  }

  private redirectWithTokens(user: OAuthTokens | undefined, res: Response) {
    if (!user?.accessToken) {
      res.redirect(
        `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/auth/callback?error=oauth_failed`,
      );
      return;
    }

    const base = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    const params = new URLSearchParams({
      token: user.accessToken,
      refresh: user.refreshToken,
      user: JSON.stringify(user.user),
    });

    res.redirect(`${base}/auth/callback?${params.toString()}`);
  }
}
