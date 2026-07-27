import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService, User } from '../../../core/services/auth.service';
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
    }),
  ],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  collapsed = signal(false);
  currentUser = signal<User | null>(null);
  isAdmin = signal(false);

  ngOnInit(): void {
    this.auth.currentUser$.subscribe((user) => {
      this.currentUser.set(user);
      this.isAdmin.set(user?.role === 'ADMIN');
    });
  }

  toggle(): void {
    this.collapsed.update((v) => !v);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/auth/login']);
  }
}
