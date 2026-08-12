import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'msh-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private currentTheme: Theme = 'light';

  constructor() {
    if (this.isBrowser) {
      this.currentTheme = this.resolveInitialTheme();
      this.applyTheme(this.currentTheme);
      this.watchSystemPreference();
    }
  }

  get theme(): Theme {
    return this.currentTheme;
  }

  toggle(): Theme {
    const next: Theme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
    return next;
  }

  setTheme(theme: Theme): void {
    this.currentTheme = theme;
    if (this.isBrowser) {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      this.applyTheme(theme);
    }
  }

  private resolveInitialTheme(): Theme {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  private applyTheme(theme: Theme): void {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }

  private watchSystemPreference(): void {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', (event) => {
      if (localStorage.getItem(THEME_STORAGE_KEY)) {
        return;
      }
      this.currentTheme = event.matches ? 'dark' : 'light';
      this.applyTheme(this.currentTheme);
    });
  }
}
