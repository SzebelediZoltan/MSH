import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService, User } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { environment } from '../../../../environments/environment';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideLayoutDashboard,
  lucideFolderOpen,
  lucideBox,
  lucideShield,
  lucideSettings,
  lucideChevronsLeft,
  lucideChevronsRight,
  lucideLogOut,
  lucideSun,
  lucideMoon,
} from '@ng-icons/lucide';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    HlmButton,
    HlmSeparator,
    HlmTooltipImports,
    HlmAvatarImports,
    NgIcon,
  ],
  viewProviders: [
    provideIcons({
      lucideLayoutDashboard,
      lucideFolderOpen,
      lucideBox,
      lucideShield,
      lucideSettings,
      lucideChevronsLeft,
      lucideChevronsRight,
      lucideLogOut,
      lucideSun,
      lucideMoon,
    }),
  ],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent implements OnInit {
  private auth = inject(AuthService);
  private theme = inject(ThemeService);
  private router = inject(Router);

  collapsed = signal(false);
  currentUser = signal<User | null>(null);
  isAdmin = signal(false);
  isDark = signal(this.theme.theme === 'dark');
  minioPublicUrl = environment.minioPublicUrl;

  ngOnInit(): void {
    this.auth.currentUser$.subscribe((user) => {
      this.currentUser.set(user);
      this.isAdmin.set(user?.role === 'ADMIN');
    });
  }

  toggle(): void {
    this.collapsed.update((v) => !v);
  }

  toggleTheme(): void {
    this.isDark.set(this.theme.toggle() === 'dark');
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/auth/login']);
  }
}
