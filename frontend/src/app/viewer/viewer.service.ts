import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

type CoreModule = typeof import('@babylonjs/core');
type Engine = InstanceType<CoreModule['Engine']>;
type Scene = InstanceType<CoreModule['Scene']>;
type ArcRotateCamera = InstanceType<CoreModule['ArcRotateCamera']>;
type Vector3 = InstanceType<CoreModule['Vector3']>;

type BoundingBox = {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};

@Injectable({ providedIn: 'root' })
export class ViewerService {
  private readonly platformId = inject(PLATFORM_ID);

  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private onResize = (): void => undefined;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    if (!this.isBrowser) return;

    this.dispose();

    const { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight } =
      await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF');

    this.canvas = canvas;
    this.engine = new Engine(canvas, true, {}, true);
    this.scene = new Scene(this.engine);

    this.camera = new ArcRotateCamera(
      'viewerCamera',
      -Math.PI / 2,
      Math.PI / 3,
      4,
      new Vector3(0, 0, 0),
      this.scene,
    );
    this.camera.attachControl(canvas, true);
    this.camera.wheelDeltaPercentage = 0.05;
    this.camera.panningSensibility = 50;

    new HemisphericLight('hemiLight', new Vector3(0, 1, 0), this.scene);
    new DirectionalLight('dirLight', new Vector3(-0.5, -1, -0.5), this.scene);

    try {
      this.scene.createDefaultEnvironment({ createGround: false });
    } catch {
      // Default environment helper is optional; the lights above are enough.
    }

    this.onResize = () => this.engine?.resize();
    window.addEventListener('resize', this.onResize);

    this.engine.runRenderLoop(() => this.scene?.render());
  }

  async loadModel(url: string): Promise<void> {
    if (!this.isBrowser || !this.scene || !this.camera) {
      throw new Error('Viewer is not initialized');
    }

    const { SceneLoader, Vector3 } = await import('@babylonjs/core');
    await import('@babylonjs/loaders/glTF');

    const result = await SceneLoader.ImportMeshAsync('', url, '', this.scene);

    if (result.meshes.length === 0) {
      throw new Error('No meshes found in model');
    }

    for (const group of result.animationGroups ?? []) {
      group.loopAnimation = true;
      group.start(true);
    }

    let min = { x: Infinity, y: Infinity, z: Infinity };
    let max = { x: -Infinity, y: -Infinity, z: -Infinity };

    for (const mesh of result.meshes) {
      const bounds = (mesh as unknown as {
        getHierarchyBoundingVectors(includeDescendants: boolean): BoundingBox;
      }).getHierarchyBoundingVectors(true);

      min = {
        x: Math.min(min.x, bounds.min.x),
        y: Math.min(min.y, bounds.min.y),
        z: Math.min(min.z, bounds.min.z),
      };
      max = {
        x: Math.max(max.x, bounds.max.x),
        y: Math.max(max.y, bounds.max.y),
        z: Math.max(max.z, bounds.max.z),
      };
    }

    const center = new Vector3(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2,
    );
    const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 0.001);
    const radius = size / 2;

    this.camera.setTarget(center);
    this.camera.target = center;
    this.camera.radius = radius * 2.5;
    this.camera.minZ = radius / 100;
    this.camera.maxZ = radius * 100;
    this.camera.lowerRadiusLimit = radius * 0.1;
    this.camera.upperRadiusLimit = radius * 10;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.onResize = () => undefined;

    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    this.camera = null;
    this.canvas = null;
  }
}
