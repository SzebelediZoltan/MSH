import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideEyeOff, lucideUserPlus } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { AuthService } from '../../core/services/auth.service';
import { API_BASE_URL } from '../../core/services/api.service';

@Component({
  selector: 'app-register',
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
  viewProviders: [provideIcons({ lucideEye, lucideEyeOff, lucideUserPlus })],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  error = '';
  oauthError = '';
  loading = signal(false);
  oauthLoading = signal<string | null>(null);
  showPassword = signal(false);
  showConfirmPassword = signal(false);

  form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  }, { validators: this.passwordsMatch });

  submit(): void {
    if (this.form.invalid) return;
    this.error = '';
    this.loading.set(true);
    this.auth.register(
      this.form.value.name!,
      this.form.value.email!,
      this.form.value.password!,
    ).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/auth/verify'], {
          queryParams: { email: this.form.value.email },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error = err.error?.message || 'Registration failed';
      },
    });
  }

  oauthLogin(provider: 'google' | 'github'): void {
    this.oauthError = '';
    this.oauthLoading.set(provider);
    window.location.href = `${API_BASE_URL}/auth/${provider}`;
  }

  private passwordsMatch(group: AbstractControl): null | { mismatch: true } {
    const pw = group.get('password')?.value;
    const cpw = group.get('confirmPassword')?.value;
    return pw && cpw && pw !== cpw ? { mismatch: true } : null;
  }
}
