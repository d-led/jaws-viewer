import {
  ACESFilmicToneMapping,
  Box3,
  type BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  type Texture,
  Timer,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { separationOffsets, type Bounds } from "../domain/explode";
import type { Matrix4Entries } from "../domain/matrix4";
import type { CameraView } from "../domain/view-settings";
import { errorMessage } from "../support/errors";
import { layerPlacement } from "./layer-placement";
import { installTwoFingerScroll } from "./two-finger-scroll";
import type {
  AddLayerOutcome,
  LayerSpec,
  StandardView,
  Viewport,
  ViewportOptions,
  ViewportStats,
} from "./viewport";

const BACKGROUND_COLOUR = 0x11151c;

/** The grid is built once at this size and scaled to whatever is loaded. */
const GRID_EXTENT_MM = 400;
const GRID_DIVISIONS = 40;
const GRID_COLOUR_LINES = 0x2b3340;
const GRID_COLOUR_AXIS = 0x3d4a5c;

/** Extra room left around the model when framing, as a multiple of the tight fit. */
const FRAME_MARGIN = 1.15;
const MIN_FRAME_EXTENT = 1;

const SURFACE_ROUGHNESS = 0.5;
const STATS_INTERVAL_SECONDS = 0.5;

/** Scan space is Z-up, the convention intraoral and CAD exports share. */
const VIEW_DIRECTIONS: Record<StandardView, readonly [number, number, number]> =
  {
    top: [0, 0, 1],
    bottom: [0, 0, -1],
    front: [0, -1, 0],
    back: [0, 1, 0],
    right: [1, 0, 0],
    left: [-1, 0, 0],
  };

/** The view a freshly loaded bundle opens in: from the front, slightly above. */
const DEFAULT_DIRECTION = new Vector3(0, -1, 0.35).normalize();

interface RenderedLayer {
  readonly id: string;
  readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  readonly geometry: BufferGeometry;
  readonly material: MeshStandardMaterial;
  readonly triangles: number;
  readonly bounds: Bounds;
  /** Distance along the occlusal axis at full separation, taken from the scan geometry. */
  separationOffset: number;
  /** The user's visibility setting; `isolate` overlays on top of it. */
  visible: boolean;
  opacity: number;
  transform: Matrix4Entries | null;
}

/**
 * Renders the bundle with three.js: one mesh per scan, orbit/pan/zoom input, and an
 * environment map so the surfaces read clearly without a studio setup.
 */
class ThreeViewport implements Viewport {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly grid: GridHelper;
  private readonly roomEnvironment: RoomEnvironment;
  private readonly environment: Texture;
  private readonly content = new Group();
  private readonly layers = new Map<string, RenderedLayer>();
  private readonly resizeObserver: ResizeObserver;
  private readonly loader = new STLLoader();
  private readonly timer = new Timer();
  private readonly options: ViewportOptions;

  private isolatedId: string | null = null;
  private separationFactor = 0;
  private framesSinceReport = 0;
  private secondsSinceReport = 0;
  private lastWidth = 0;
  private lastHeight = 0;

  constructor(canvas: HTMLCanvasElement, options: ViewportOptions = {}) {
    this.options = options;
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;

    this.camera = new PerspectiveCamera(45, 1, 0.1, 10_000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.copy(DEFAULT_DIRECTION).multiplyScalar(200);

    this.scene.background = new Color(BACKGROUND_COLOUR);
    this.scene.add(this.content);
    this.addLights();

    this.roomEnvironment = new RoomEnvironment();
    this.environment = new PMREMGenerator(this.renderer).fromScene(
      this.roomEnvironment,
      0.04,
    ).texture;
    this.scene.environment = this.environment;

    this.grid = new GridHelper(
      GRID_EXTENT_MM,
      GRID_DIVISIONS,
      GRID_COLOUR_AXIS,
      GRID_COLOUR_LINES,
    );
    this.grid.rotation.x = Math.PI / 2; // the helper is built in XZ; scans are XY
    this.scene.add(this.grid);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    // Mouse: drag orbits, wheel zooms, right-drag pans.
    // Touch: one finger orbits and nothing else, so a drag never scrolls as well; two fingers
    // scroll the page. OrbitControls would otherwise set `touch-action: none` and claim both.
    this.controls.addEventListener("end", this.handleCameraSettled);
    canvas.style.touchAction = "none";
    installTwoFingerScroll(canvas, {
      setPanning: (enabled) => {
        this.controls.enablePan = enabled;
      },
    });

    // The timer is deliberately not connected to the Page Visibility API: nothing here is
    // animated against wall-clock time, and that API reports a zero delta whenever the tab
    // is in the background, which would stall the readout instead of just slowing it.
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(canvas);
    this.handleResize();

    this.renderer.setAnimationLoop(this.render);
  }

  addLayer(spec: LayerSpec): AddLayerOutcome {
    let layer: RenderedLayer;
    try {
      layer = this.createLayer(spec);
    } catch (error) {
      return { ok: false, reason: errorMessage(error) };
    }

    this.layers.set(layer.id, layer);
    this.content.add(layer.mesh);
    this.refreshSeparation();
    return { ok: true };
  }

  private createLayer(spec: LayerSpec): RenderedLayer {
    const geometry = this.loader.parse(spec.stl);
    // Scanner exports often carry unusable facet normals, so shading is derived from
    // the triangles themselves.
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const material = new MeshStandardMaterial({
      color: new Color(spec.colour),
      roughness: SURFACE_ROUGHNESS,
      metalness: 0,
      side: DoubleSide,
    });

    const mesh = new Mesh(geometry, material);
    mesh.name = spec.label;
    // Placement is composed by hand, so three must not overwrite it each frame.
    mesh.matrixAutoUpdate = false;

    return {
      id: spec.id,
      mesh,
      geometry,
      material,
      triangles: triangleCountOf(geometry),
      bounds: boundsOf(geometry),
      separationOffset: 0,
      visible: true,
      opacity: 1,
      transform: null,
    };
  }

  clearLayers(): void {
    for (const layer of this.layers.values()) {
      this.content.remove(layer.mesh);
      layer.geometry.dispose();
      layer.material.dispose();
    }
    this.layers.clear();
    this.isolatedId = null;
  }

  setLayerVisible(id: string, visible: boolean): void {
    const layer = this.layerFor(id);
    layer.visible = visible;
    this.applyLayerState(layer);
  }

  setLayerOpacity(id: string, opacity: number): void {
    const layer = this.layerFor(id);
    layer.opacity = Math.min(Math.max(opacity, 0), 1);
    this.applyLayerState(layer);
  }

  setLayerColour(id: string, colour: string): void {
    this.layerFor(id).material.color.set(colour);
  }

  setLayerTransform(id: string, transform: Matrix4Entries | null): void {
    const layer = this.layerFor(id);
    layer.transform = transform;
    this.applyPlacement(layer);
  }

  setSeparation(factor: number): void {
    this.separationFactor = Math.min(Math.max(factor, 0), 1);
    for (const layer of this.layers.values()) {
      this.applyPlacement(layer);
    }

    // Opening makes the assembly taller, so pull back to keep all of it in view. The grid is
    // left alone: it is the fixed floor the parts are being lifted off.
    const box = this.visibleBounds();
    if (box !== null) this.frame(box, this.currentDirection());
  }

  isolate(id: string | null): void {
    this.isolatedId = id;
    for (const layer of this.layers.values()) {
      this.applyLayerState(layer);
    }
  }

  fitAll(): void {
    const box = this.visibleBounds();
    if (box === null) return;

    this.frame(box, this.currentDirection());
    this.syncGrid(box);
  }

  fitLayer(id: string): void {
    this.frame(
      new Box3().setFromObject(this.layerFor(id).mesh),
      this.currentDirection(),
    );
  }

  setView(view: StandardView): void {
    const [x, y, z] = VIEW_DIRECTIONS[view];
    // Looking straight down an axis needs a different up vector to stay well defined.
    const isPlanView = view === "top" || view === "bottom";
    this.camera.up.set(0, isPlanView ? 1 : 0, isPlanView ? 0 : 1);

    const box = this.visibleBounds();
    if (box !== null) this.frame(box, new Vector3(x, y, z));
  }

  setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  getCamera(): CameraView {
    const { x, y, z } = this.camera.position;
    const { x: tx, y: ty, z: tz } = this.controls.target;
    return { position: [x, y, z], target: [tx, ty, tz] };
  }

  setCamera(view: CameraView): void {
    this.camera.position.set(...view.position);
    this.controls.target.set(...view.target);

    const box = this.visibleBounds();
    if (box !== null) this.limitZoom(box);
    this.controls.update();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.timer.dispose();
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("end", this.handleCameraSettled);
    this.clearLayers();
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.roomEnvironment.dispose();
    this.environment.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }

  private addLights(): void {
    this.scene.add(new HemisphereLight(0xffffff, 0x22303f, 1.6));

    const key = new DirectionalLight(0xffffff, 1.8);
    key.position.set(60, -90, 120);
    this.scene.add(key);

    const fill = new DirectionalLight(0xffffff, 0.7);
    fill.position.set(-90, 60, -60);
    this.scene.add(fill);
  }

  private layerFor(id: string): RenderedLayer {
    const layer = this.layers.get(id);
    if (layer === undefined)
      throw new Error(`No layer with id "${id}" has been added.`);
    return layer;
  }

  /**
   * Recomputes how far each layer travels, because separation depends on the whole set: a
   * layer added later changes what "the middle" means for the ones already there.
   */
  private refreshSeparation(): void {
    const offsets = separationOffsets(
      [...this.layers.values()].map((layer) => ({
        id: layer.id,
        bounds: layer.bounds,
      })),
    );

    for (const layer of this.layers.values()) {
      layer.separationOffset = offsets.get(layer.id) ?? 0;
      this.applyPlacement(layer);
    }
  }

  private applyPlacement(layer: RenderedLayer): void {
    layer.mesh.matrix.copy(
      layerPlacement(
        layer.transform,
        layer.separationOffset * this.separationFactor,
      ),
    );
    layer.mesh.matrixWorldNeedsUpdate = true;
  }

  /** Folds the user's settings and any isolated layer into what the renderer sees. */
  private applyLayerState(layer: RenderedLayer): void {
    const soloed = this.isolatedId === null || this.isolatedId === layer.id;
    layer.mesh.visible = layer.visible && soloed;

    layer.material.opacity = layer.opacity;
    // See-through layers must not occlude each other, or the ones drawn first would
    // punch holes in the ones behind them.
    layer.material.transparent = layer.opacity < 1;
    layer.material.depthWrite = layer.opacity >= 1;
  }

  private visibleBounds(): Box3 | null {
    const box = new Box3();
    for (const layer of this.layers.values()) {
      if (layer.mesh.visible) box.expandByObject(layer.mesh);
    }
    return box.isEmpty() ? null : box;
  }

  private frame(box: Box3, direction: Vector3): void {
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const extent = Math.max(size.x, size.y, size.z, MIN_FRAME_EXTENT);
    const halfFov = (this.camera.fov * Math.PI) / 360;
    const fitHeight = extent / 2 / Math.tan(halfFov);
    const fitWidth = fitHeight / Math.max(this.camera.aspect, 0.1);
    const distance = FRAME_MARGIN * Math.max(fitHeight, fitWidth);

    this.camera.position
      .copy(centre)
      .addScaledVector(direction.clone().normalize(), distance);
    this.camera.near = Math.max(distance / 100, 0.01);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(centre);
    this.limitZoom(box);
    this.controls.update();
  }

  private limitZoom(box: Box3): void {
    const size = box.getSize(new Vector3());
    const extent = Math.max(size.x, size.y, size.z, MIN_FRAME_EXTENT);

    this.controls.minDistance = extent / 100;
    this.controls.maxDistance = extent * 100;
  }

  private syncGrid(box: Box3): void {
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const scale = Math.max(size.x, size.y, MIN_FRAME_EXTENT) / GRID_EXTENT_MM;

    this.grid.scale.setScalar(scale);
    this.grid.position.set(centre.x, centre.y, box.min.z);
  }

  private currentDirection(): Vector3 {
    const direction = this.camera.position.clone().sub(this.controls.target);
    return direction.lengthSq() === 0
      ? DEFAULT_DIRECTION.clone()
      : direction.normalize();
  }

  private visibleTriangleCount(): number {
    let total = 0;
    for (const layer of this.layers.values()) {
      if (layer.mesh.visible) total += layer.triangles;
    }
    return total;
  }

  private readonly handleResize = (): void => {
    const width = this.renderer.domElement.clientWidth;
    const height = this.renderer.domElement.clientHeight;
    if (width === 0 || height === 0) return;
    // Resizing reallocates the drawing buffer, so only do it when the size really changed.
    if (width === this.lastWidth && height === this.lastHeight) return;
    this.lastWidth = width;
    this.lastHeight = height;

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private readonly handleCameraSettled = (): void => {
    this.options.onCameraSettled?.();
  };

  private readonly render = (timestamp: number): void => {
    this.timer.update(timestamp);
    const elapsed = this.timer.getDelta();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.reportStats(elapsed);
  };

  private reportStats(elapsed: number): void {
    const { onStats } = this.options;
    if (onStats === undefined) return;

    this.framesSinceReport += 1;
    this.secondsSinceReport += elapsed;
    if (this.secondsSinceReport < STATS_INTERVAL_SECONDS) return;

    const stats: ViewportStats = {
      fps: Math.round(this.framesSinceReport / this.secondsSinceReport),
      visibleTriangles: this.visibleTriangleCount(),
      drawCalls: this.renderer.info.render.calls,
    };
    this.framesSinceReport = 0;
    this.secondsSinceReport = 0;
    onStats(stats);
  }
}

export function createViewport(
  canvas: HTMLCanvasElement,
  options: ViewportOptions = {},
): Viewport {
  return new ThreeViewport(canvas, options);
}

function triangleCountOf(geometry: BufferGeometry): number {
  const positions = geometry.attributes["position"];
  return positions === undefined ? 0 : Math.floor(positions.count / 3);
}

function boundsOf(geometry: BufferGeometry): Bounds {
  const box = geometry.boundingBox;
  if (box === null) return { min: [0, 0, 0], max: [0, 0, 0] };

  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}
