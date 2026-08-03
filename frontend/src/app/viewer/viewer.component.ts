import {
  Component,
  OnInit,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ViewerService } from './viewer.service';
import { ApiService } from '../core/services/api.service';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmBadge } from '@spartan-ng/helm/badge';
import type { Model3D } from '../projects/project.model';

type StatusVariant = 'default' | 'secondary' | 'destructive';

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [CommonModule, RouterLink, HlmButton, HlmSpinner, HlmBadge],
  template: `
    <div class="relative h-screen w-full bg-black">
      <canvas #viewerCanvas class="block h-full w-full"></canvas>

      <div class="absolute left-4 top-4 flex items-center gap-3">
        <a
          hlmBtn
          variant="outline"
          size="sm"
          class="text-white"
          [routerLink]="['/app/projects']"
        >
          Back
        </a>
        @if (model()) {
          <div
            class="flex items-center gap-2 rounded-md bg-black/50 px-3 py-1.5 text-sm text-white backdrop-blur"
          >
            <span class="font-medium">{{ model()!.name }}</span>
            <span class="text-white/60">{{ model()!.format?.toUpperCase() }}</span>
            <span class="text-white/60">{{ formatBytes(model()!.fileSize) }}</span>
            <hlm-badge [variant]="statusVariant()">{{ model()!.status }}</hlm-badge>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="absolute inset-0 flex items-center justify-center bg-black/60">
          <div class="flex flex-col items-center gap-3 text-white">
            <hlm-spinner class="h-8 w-8" />
            <span class="text-sm">Loading model…</span>
          </div>
        </div>
      }

      @if (error()) {
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 text-white">
          <p class="max-w-md px-6 text-center text-sm">{{ error() }}</p>
          <button hlmBtn variant="outline" (click)="router.navigate(['/app/projects'])">
            Go to Projects
          </button>
        </div>
      }
    </div>
  `,
})
export class ViewerComponent implements OnInit {
  private readonly viewer = inject(ViewerService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);

  readonly canvasEl = viewChild.required<ElementRef<HTMLCanvasElement>>('viewerCanvas');

  model = signal<Model3D | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.fail('Missing model id');
      return;
    }

    try {
      const model = await firstValueFrom(this.api.get<Model3D>(`/models/${id}`));
      this.model.set(model);

      if (model.status === 'PROCESSING' || model.status === 'UPLOADING') {
        this.fail('This model is still processing. Try again in a moment.');
        return;
      }
      if (model.status === 'ERROR') {
        this.fail('This model could not be processed.');
        return;
      }

      const url = await firstValueFrom(this.api.getText(`/models/${id}/download`));
      await this.viewer.initialize(this.canvasEl().nativeElement);
      await this.viewer.loadModel(url);
    } catch (err) {
      console.error('viewer load failed', err);
      this.fail('Failed to load the model.');
      return;
    }

    this.loading.set(false);
  }

  ngOnDestroy(): void {
    this.viewer.dispose();
  }

  statusVariant(): StatusVariant {
    const status = this.model()?.status;
    if (status === 'ERROR') return 'destructive';
    if (status === 'READY') return 'default';
    return 'secondary';
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  private fail(message: string): void {
    this.error.set(message);
    this.loading.set(false);
  }
}
