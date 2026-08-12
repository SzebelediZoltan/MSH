import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { VerifyComponent } from './verify/verify.component';
import { OAuthCallbackComponent } from './oauth-callback/callback.component';

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild([
      { path: 'login', component: LoginComponent },
      { path: 'register', component: RegisterComponent },
      { path: 'verify', component: VerifyComponent },
      { path: 'callback', component: OAuthCallbackComponent },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ]),
    LoginComponent,
    RegisterComponent,
    VerifyComponent,
    OAuthCallbackComponent,
  ],
})
export class AuthModule {}
