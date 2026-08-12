import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER';
  emailVerified: boolean;
  avatarKey: string | null;
  createdAt?: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

const TOKEN_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'current_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private isLoggedInSubject = new BehaviorSubject<boolean>(this.hasToken());
  private currentUserSubject = new BehaviorSubject<User | null>(this.loadUser());

  isLoggedIn$ = this.isLoggedInSubject.asObservable();
  currentUser$ = this.currentUserSubject.asObservable();

  constructor(private api: ApiService) {}

  login(email: string, password: string): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/auth/login', { email, password }).pipe(
      tap(res => this.handleAuthResponse(res)),
    );
  }

  register(name: string, email: string, password: string): Observable<{ id: string; email: string; name: string }> {
    return this.api.post<{ id: string; email: string; name: string }>('/auth/register', { name, email, password });
  }

  verifyEmail(email: string, code: string): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/auth/verify-email', { email, code }).pipe(
      tap(res => this.handleAuthResponse(res)),
    );
  }

  sendVerifyCode(email: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/auth/send-verify-code', { email });
  }

  refreshToken(): Observable<RefreshResponse> {
    const refreshToken = this.getRefreshToken();
    return this.api.post<RefreshResponse>('/auth/refresh', { refreshToken }).pipe(
      tap(res => {
        if (!this.isBrowser) return;
        localStorage.setItem(TOKEN_KEY, res.accessToken);
        localStorage.setItem(REFRESH_KEY, res.refreshToken);
      }),
    );
  }

  getMe(): Observable<User> {
    return this.api.get<User>('/auth/me').pipe(
      tap(user => {
        if (!this.isBrowser) return;
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.currentUserSubject.next(user);
      }),
    );
  }

  handleOAuthSession(params: URLSearchParams): boolean {
    const token = params.get('token');
    const refresh = params.get('refresh');
    const user = params.get('user');

    if (!token || !user) return false;

    let parsedUser: User;
    try {
      parsedUser = JSON.parse(user);
    } catch {
      return false;
    }

    if (!this.isBrowser) return true;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_KEY, refresh ?? token);
    localStorage.setItem(USER_KEY, JSON.stringify(parsedUser));
    this.isLoggedInSubject.next(true);
    this.currentUserSubject.next(parsedUser);
    return true;
  }

  logout(): void {
    if (!this.isBrowser) return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this.isLoggedInSubject.next(false);
    this.currentUserSubject.next(null);
  }

  getCurrentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  updateCurrentUser(user: Partial<User>): void {
    const current = this.currentUserSubject.value;
    if (!current) return;
    const updated = { ...current, ...user };
    if (this.isBrowser) {
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
    this.currentUserSubject.next(updated);
  }

  getToken(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(REFRESH_KEY);
  }

  private handleAuthResponse(res: AuthResponse): void {
    if (!this.isBrowser) return;
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(REFRESH_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.isLoggedInSubject.next(true);
    this.currentUserSubject.next(res.user);
  }

  private hasToken(): boolean {
    if (!this.isBrowser) return false;
    return !!localStorage.getItem(TOKEN_KEY);
  }

  private loadUser(): User | null {
    if (!this.isBrowser) return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
