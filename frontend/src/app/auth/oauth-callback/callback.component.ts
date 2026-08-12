import { Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAlertCircle, lucideArrowRight } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  imports: [NgIcon, HlmCardImports, HlmButton, HlmSpinner],
  viewProviders: [provideIcons({ lucideAlertCircle, lucideArrowRight })],
  templateUrl: './callback.component.html',
})
export class OAuthCallbackComponent {
  private platformId = inject(PLATFORM_ID);
  private router = inject(Router);
  private auth = inject(AuthService);

  error = signal('');
  processing = signal(true);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    const params = new URLSearchParams(window.location.search);
    const ok = this.auth.handleOAuthSession(params);

    if (ok && !params.get('error')) {
      setTimeout(() => this.router.navigate(['/app/dashboard']), 800);
    } else {
      this.processing.set(false);
      this.error.set(params.get('error') === 'oauth_failed' ? 'OAuth login failed' : 'Unable to complete OAuth login');
    }
  }

  backToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
}