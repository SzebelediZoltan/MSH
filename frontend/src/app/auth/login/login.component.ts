import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideEyeOff, lucideLogIn } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { AuthService } from '../../core/services/auth.service';
import { API_BASE_URL } from '../../core/services/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmCardImports,
    HlmFieldImports,
    HlmLabel,
    HlmInput,
    HlmButton,
    HlmSpinner,
  ],
  viewProviders: [provideIcons({ lucideEye, lucideEyeOff, lucideLogIn })],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  error = '';
  oauthError = '';
  loading = signal(false);
  oauthLoading = signal<string | null>(null);
  showPassword = signal(false);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  oauthLogin(provider: 'google' | 'github'): void {
    this.oauthError = '';
    this.oauthLoading.set(provider);
    window.location.href = `${API_BASE_URL}/auth/${provider}`;
  }

  submit(): void {
    if (this.form.invalid) return;
    this.error = '';
    this.loading.set(true);
    this.auth.login(this.form.value.email!, this.form.value.password!).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/app/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.error?.message === 'Email not verified') {
          this.router.navigate(['/auth/verify'], {
            queryParams: { email: this.form.value.email },
          });
          return;
        }
        this.error = err.error?.message || 'Login failed';
      },
    });
  }
}
