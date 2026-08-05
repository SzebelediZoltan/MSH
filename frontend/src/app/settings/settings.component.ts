import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, User } from '../core/services/auth.service';
import { ApiService } from '../core/services/api.service';
import { environment } from '../../environments/environment';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { BrnAlertDialogImports } from '@spartan-ng/brain/alert-dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCrop,
  lucideLoader2,
  lucideLock,
  lucideTrash2,
  lucideUpload,
  lucideUser,
  lucideX,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HttpEventType } from '@angular/common/http';
import type { HttpEvent } from '@angular/common/http';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';

const MINIO_PUBLIC_URL = environment.minioPublicUrl;

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HlmButton,
    HlmCardImports,
    HlmFieldImports,
    HlmInput,
    HlmLabel,
    HlmSeparator,
    HlmAvatarImports,
    HlmAlertDialogImports,
    BrnAlertDialogImports,
    NgIcon,
    ImageCropperComponent,
  ],
  viewProviders: [
    provideIcons({
      lucideUser,
      lucideLock,
      lucideTrash2,
      lucideUpload,
      lucideX,
      lucideCheck,
      lucideLoader2,
      lucideCrop,
    }),
  ],
  template: `
    <div class="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <div>
        <h1 class="text-foreground text-2xl font-semibold tracking-tight">Settings</h1>
        <p class="text-muted-foreground mt-1 text-sm">Manage your account and profile</p>
      </div>

      <hlm-separator />

      <!-- Profile Picture -->
      <section>
        <h2 class="mb-4 text-lg font-medium">Profile Picture</h2>
        <div class="flex items-center gap-6">
          <hlm-avatar class="h-20 w-20 rounded-xl">
            <div
              class="bg-muted flex h-full w-full items-center justify-center rounded-xl text-2xl font-medium"
            >
              @if (avatarUrl()) {
                <img
                  [src]="avatarUrl()"
                  alt="Avatar"
                  class="h-full w-full rounded-xl object-cover"
                  (error)="avatarUrl.set(null)"
                />
              } @else {
                {{ currentUser()?.name?.charAt(0) ?? '?' }}
              }
            </div>
          </hlm-avatar>

          <div class="flex flex-col gap-2">
            <input
              #fileInput
              type="file"
              accept="image/*"
              class="hidden"
              (change)="onFileSelected($event)"
            />
            <button hlmBtn variant="outline" size="sm" (click)="fileInput.click()" [disabled]="uploadingAvatar()">
              @if (uploadingAvatar()) {
                <ng-icon name="lucideLoader2" class="mr-1.5 h-4 w-4 animate-spin" />
              } @else {
                <ng-icon name="lucideUpload" class="mr-1.5 h-4 w-4" />
              }
              Upload
            </button>
            @if (currentUser()?.avatarKey) {
              <button hlmBtn variant="outline" size="sm" (click)="removeAvatar()" [disabled]="uploadingAvatar()">
                <ng-icon name="lucideX" class="mr-1.5 h-4 w-4" />
                Remove
              </button>
            }
          </div>
        </div>
      </section>

      @if (cropDialogVisible()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          (click)="closeCrop()"
        >
          <div
            class="bg-background mx-4 w-full max-w-lg rounded-xl p-6 shadow-2xl"
            (click)="$event.stopPropagation()"
          >
            <h3 class="mb-4 text-lg font-medium">Crop Avatar</h3>
            <div class="overflow-hidden rounded-lg">
              <image-cropper
                [imageFile]="cropImageFile() ?? undefined"
                [containWithinAspectRatio]="true"
                [aspectRatio]="1 / 1"
                format="png"
                [maintainAspectRatio]="true"
                [resizeToWidth]="512"
                (imageCropped)="onCrop($event)"
              />
            </div>
            <div class="mt-4 flex justify-end gap-2">
              <button hlmBtn variant="outline" size="sm" (click)="closeCrop()">Cancel</button>
              <button hlmBtn size="sm" (click)="uploadCropped()" [disabled]="uploadingAvatar()">
                @if (uploadingAvatar()) {
                  <ng-icon name="lucideLoader2" class="mr-1.5 h-4 w-4 animate-spin" />
                } @else {
                  <ng-icon name="lucideCrop" class="mr-1.5 h-4 w-4" />
                }
                Crop & Upload
              </button>
            </div>
          </div>
        </div>
      }

      <hlm-separator />

      <!-- Basic Info -->
      <section>
        <h2 class="mb-4 text-lg font-medium">Basic Info</h2>
        <form [formGroup]="profileForm" (ngSubmit)="updateProfile()" class="space-y-4">
          <hlm-field orientation="vertical">
            <label hlmLabel>Name</label>
            <hlm-field-content>
              <input hlmInput formControlName="name" placeholder="Your name" />
            </hlm-field-content>
          </hlm-field>

          <hlm-field orientation="vertical">
            <label hlmLabel>Email</label>
            <hlm-field-content>
              <input hlmInput formControlName="email" type="email" placeholder="your@email.com" />
            </hlm-field-content>
            @if (profileForm.controls.email.invalid && profileForm.controls.email.touched) {
              <hlm-field-error>Enter a valid email address</hlm-field-error>
            }
          </hlm-field>

          <button hlmBtn type="submit" [disabled]="profileForm.invalid || savingProfile()">
            @if (savingProfile()) {
              <ng-icon name="lucideLoader2" class="mr-1.5 h-4 w-4 animate-spin" />
            }
            Save Changes
          </button>
        </form>
      </section>

      <hlm-separator />

      <!-- Password -->
      <section>
        <h2 class="mb-4 text-lg font-medium">Password</h2>
        <form [formGroup]="passwordForm" (ngSubmit)="changePassword()" class="space-y-4">
          <hlm-field orientation="vertical">
            <label hlmLabel>Current Password</label>
            <hlm-field-content>
              <input hlmInput formControlName="currentPassword" type="password" placeholder="Current password" />
            </hlm-field-content>
            @if (passwordForm.controls.currentPassword.invalid && passwordForm.controls.currentPassword.touched) {
              <hlm-field-error>Current password is required</hlm-field-error>
            }
          </hlm-field>

          <hlm-field orientation="vertical">
            <label hlmLabel>New Password</label>
            <hlm-field-content>
              <input hlmInput formControlName="newPassword" type="password" placeholder="New password (min 6 chars)" />
            </hlm-field-content>
            @if (passwordForm.controls.newPassword.invalid && passwordForm.controls.newPassword.touched) {
              <hlm-field-error>Password must be at least 6 characters</hlm-field-error>
            }
          </hlm-field>

          <hlm-field orientation="vertical">
            <label hlmLabel>Confirm New Password</label>
            <hlm-field-content>
              <input hlmInput formControlName="confirmPassword" type="password" placeholder="Confirm new password" />
            </hlm-field-content>
            @if (passwordForm.errors?.['mismatch'] && passwordForm.controls.confirmPassword.touched) {
              <hlm-field-error>Passwords do not match</hlm-field-error>
            }
          </hlm-field>

          <button hlmBtn type="submit" [disabled]="passwordForm.invalid || savingPassword()">
            @if (savingPassword()) {
              <ng-icon name="lucideLoader2" class="mr-1.5 h-4 w-4 animate-spin" />
            }
            Update Password
          </button>
        </form>
      </section>

      <hlm-separator />

      <!-- Danger Zone -->
      <section class="rounded-lg border border-destructive/30 p-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-medium text-destructive">Danger Zone</h2>
            <p class="text-muted-foreground mt-1 text-sm">
              Permanently delete your account and all associated data
            </p>
          </div>
          <brn-alert-dialog #alertDialog>
            <button hlmBtn variant="destructive" brnAlertDialogTrigger>
              <ng-icon name="lucideTrash2" class="mr-1.5 h-4 w-4" />
              Delete Account
            </button>
            <hlm-alert-dialog-content *brnAlertDialogContent="let ctx">
              <hlm-alert-dialog-header>
                <h3 hlmAlertDialogTitle>Delete Account?</h3>
                <p hlmAlertDialogDescription>
                  This action cannot be undone. All your projects, models, and data will be
                  permanently deleted.
                </p>
              </hlm-alert-dialog-header>
              <hlm-alert-dialog-footer>
                <button hlmBtn variant="outline" (click)="ctx.close()">Cancel</button>
                <button hlmBtn variant="destructive" (click)="deleteAccount(); ctx.close()">
                  @if (deletingAccount()) {
                    <ng-icon name="lucideLoader2" class="mr-1.5 h-4 w-4 animate-spin" />
                  }
                  Delete My Account
                </button>
              </hlm-alert-dialog-footer>
            </hlm-alert-dialog-content>
          </brn-alert-dialog>
        </div>
      </section>
    </div>
  `,
})
export class SettingsComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);

  currentUser = signal<User | null>(null);
  avatarUrl = signal<string | null>(null);
  uploadingAvatar = signal(false);
  savingProfile = signal(false);
  savingPassword = signal(false);
  deletingAccount = signal(false);

  cropDialogVisible = signal(false);
  cropImageFile = signal<File | null>(null);
  croppedBlob = signal<Blob | null>(null);

  profileForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
  });

  passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: this.passwordsMatch },
  );

  constructor() {
    const user = this.auth.getCurrentUserValue();
    if (user) {
      this.currentUser.set(user);
      this.profileForm.patchValue({ name: user.name ?? '', email: user.email });
      if (user.avatarKey) {
        this.avatarUrl.set(`${MINIO_PUBLIC_URL}/${user.avatarKey}`);
      }
    }
  }

  private passwordsMatch(group: { get: (key: string) => any }) {
    const pw = group.get('newPassword')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return pw === confirm ? null : { mismatch: true };
  }

  updateProfile(): void {
    if (this.profileForm.invalid) return;
    this.savingProfile.set(true);
    this.api.updateProfile(this.profileForm.getRawValue()).subscribe({
      next: (user) => {
        this.currentUser.set(user);
        this.auth.updateCurrentUser(user);
        toast.success('Profile updated');
        this.savingProfile.set(false);
      },
      error: (err) => {
        console.error('updateProfile failed', err);
        toast.error('Failed to update profile');
        this.savingProfile.set(false);
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    this.cropImageFile.set(file);
    this.croppedBlob.set(null);
    this.cropDialogVisible.set(true);
  }

  onCrop(event: ImageCroppedEvent): void {
    if (event.blob) {
      this.croppedBlob.set(event.blob);
    }
  }

  closeCrop(): void {
    this.cropDialogVisible.set(false);
    this.cropImageFile.set(null);
    this.croppedBlob.set(null);
  }

  uploadCropped(): void {
    const blob = this.croppedBlob();
    if (!blob) return;

    this.uploadingAvatar.set(true);
    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    this.api.uploadAvatar(file).subscribe({
      next: (event: HttpEvent<any>) => {
        if (event.type === HttpEventType.Response && event.body) {
          this.currentUser.set(event.body);
          this.auth.updateCurrentUser(event.body);
          if (event.body.avatarKey) {
            this.avatarUrl.set(`${MINIO_PUBLIC_URL}/${event.body.avatarKey}`);
          } else {
            this.avatarUrl.set(null);
          }
          this.profileForm.patchValue({ name: event.body.name, email: event.body.email });
          toast.success('Avatar uploaded');
          this.uploadingAvatar.set(false);
          this.closeCrop();
        }
      },
      error: (err) => {
        console.error('uploadCropped failed', err);
        toast.error('Failed to upload avatar');
        this.uploadingAvatar.set(false);
      },
    });
  }

  removeAvatar(): void {
    this.uploadingAvatar.set(true);
    this.api.deleteAvatar().subscribe({
      next: (user) => {
        this.currentUser.set(user);
        this.auth.updateCurrentUser(user);
        this.avatarUrl.set(null);
        toast.success('Avatar removed');
        this.uploadingAvatar.set(false);
      },
      error: (err) => {
        console.error('removeAvatar failed', err);
        toast.error('Failed to remove avatar');
        this.uploadingAvatar.set(false);
      },
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) return;
    this.savingPassword.set(true);
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.api.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        toast.success('Password updated');
        this.passwordForm.reset();
        this.savingPassword.set(false);
      },
      error: (err) => {
        console.error('changePassword failed', err);
        toast.error('Failed to update password');
        this.savingPassword.set(false);
      },
    });
  }

  deleteAccount(): void {
    this.deletingAccount.set(true);
    this.api.deleteAccount().subscribe({
      next: () => {
        this.auth.logout();
        this.router.navigate(['/']);
        toast.success('Account deleted');
      },
      error: (err) => {
        console.error('deleteAccount failed', err);
        toast.error('Failed to delete account');
        this.deletingAccount.set(false);
      },
    });
  }
}
