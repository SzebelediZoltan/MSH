import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.module').then((m) => m.AuthModule),
  },
  {
    path: 'not-authenticated',
    loadComponent: () =>
      import('./shared/not-authenticated/not-authenticated.component').then(
        (m) => m.NotAuthenticatedComponent,
      ),
  },
  {
    path: 'app',
    loadComponent: () =>
      import('./shared/layout/app-layout/app-layout.component').then(
        (m) => m.AppLayoutComponent,
      ),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./dashboard/dashboard.module').then((m) => m.DashboardModule),
      },
      {
        path: 'projects',
        loadChildren: () =>
          import('./projects/projects.module').then((m) => m.ProjectsModule),
      },
      {
        path: 'upload',
        loadChildren: () =>
          import('./upload/upload.module').then((m) => m.UploadModule),
      },
      {
        path: 'models',
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then(
            (m) => m.PlaceholderComponent,
          ),
        data: {
          title: 'Models',
          icon: 'box',
          description: 'Browse and manage all your uploaded 3D models in one place.',
        },
      },
      {
        path: 'admin/dashboard',
        loadComponent: () =>
          import('./shared/placeholder/placeholder.component').then(
            (m) => m.PlaceholderComponent,
          ),
        canActivate: [() => roleGuard(['ADMIN'])],
        data: {
          title: 'Admin Dashboard',
          icon: 'shield',
          description: 'User management, system settings, and platform analytics.',
        },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'admin/users',
        loadComponent: () =>
          import('./admin/users/users.component').then((m) => m.UsersComponent),
        canActivate: [() => roleGuard(['ADMIN'])],
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '**',
    loadComponent: () =>
      import('./shared/not-found/not-found.component').then(
        (m) => m.NotFoundComponent,
      ),
  },
];
