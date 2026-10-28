import {Layout, type LayoutProps} from '@motion-canvas/2d';
import {
  Camera,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';

export interface ThreeFrame {
  timeSeconds: number;
  width: number;
  height: number;
  bufferWidth: number;
  bufferHeight: number;
}

export interface ThreeViewProps extends LayoutProps {
  scene: Scene;
  camera: Camera;
  /** Evaluate the complete pose at this time, including after seeking/resetting. */
  onFrame?: (frame: ThreeFrame) => void;
}

/**
 * Owns the renderer only. Scene/model owners dispose their geometries, materials
 * and textures. The render hook is synchronous; load assets before using it.
 */
export class ThreeView extends Layout {
  private renderer?: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: Camera;
  private readonly onFrame?: ThreeViewProps['onFrame'];

  public constructor({scene, camera, onFrame, ...layout}: ThreeViewProps) {
    super(layout);
    this.scene = scene;
    this.camera = camera;
    this.onFrame = onFrame;
  }

  protected override draw(context: CanvasRenderingContext2D): void {
    const {width, height} = this.computedSize();
    if (width <= 0 || height <= 0) return;
    const timeSeconds = this.view().globalTime();
    const transform = context.getTransform();
    const bufferWidth = Math.max(1, Math.ceil(width * Math.hypot(transform.a, transform.b)));
    const bufferHeight = Math.max(1, Math.ceil(height * Math.hypot(transform.c, transform.d)));

    this.renderer ??= new WebGLRenderer({alpha: true, antialias: true});
    this.renderer.outputColorSpace = SRGBColorSpace;
    if (this.renderer.domElement.width !== bufferWidth ||
        this.renderer.domElement.height !== bufferHeight) {
      this.renderer.setSize(bufferWidth, bufferHeight, false);
    }
    if (this.camera instanceof PerspectiveCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    // Orthographic frusta and content-specific framing belong to the scene.
    this.onFrame?.({timeSeconds, width, height, bufferWidth, bufferHeight});
    this.renderer.render(this.scene, this.camera);
    context.drawImage(this.renderer.domElement, -width / 2, -height / 2, width, height);
    super.draw(context);
  }

  public override dispose(): void {
    this.renderer?.dispose();
    this.renderer = undefined;
    super.dispose();
  }
}
