import {
  ACESFilmicToneMapping,
  Box3,
  BufferAttribute,
  type BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
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
import { WELD_FRACTION } from "../domain/curvature";
import { separationOffsets, type Bounds } from "../domain/explode";
import type { Matrix4Entries } from "../domain/matrix4";
import {
  DEFAULT_SMOOTHING,
  clampSmoothing,
  type CameraView,
  type LayerSurface,
} from "../domain/view-settings";
import { assertNever, errorMessage } from "../support/errors";
import { layerPlacement } from "./layer-placement";
import {
  createSurfacePainter,
  replyFor,
  type SurfaceEvent,
  type SurfacePainter,
  type SurfaceReply,
} from "./surface-painter";
import { installTwoFingerScroll } from "./two-finger-scroll";
import type {
  AddLayerOutcome,
  LayerSpec,
  StandardView,
  SurfaceState,
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

/** Either the layer's own colour, lit like the rest of the scene, or the map itself, unlit. */
type SurfaceMaterial = MeshStandardMaterial | MeshBasicMaterial;

interface RenderedLayer {
  readonly id: string;
  readonly label: string;
  readonly mesh: Mesh<BufferGeometry, SurfaceMaterial>;
  readonly geometry: BufferGeometry;
  /** The layer's own colour, lit and shaded like the rest of the scene. */
  readonly material: MeshStandardMaterial;
  /**
   * The measured map, unlit.
   *
   * A curvature is a reading rather than a look, and a surface under this scene's lights comes
   * back washed out whatever the ramp says: with the studio environment and a tone curve on top of
   * it, the middle of the ramp prints as white and the ends as pastel. Unlit, the pixel is the
   * value.
   */
  readonly measuredMaterial: MeshBasicMaterial;
  /** The layer's own colour, kept while a curvature ramp is the thing on screen. */
  colour: string;
  readonly triangles: number;
  readonly bounds: Bounds;
  /** Distance along the occlusal axis at full separation, taken from the scan geometry. */
  separationOffset: number;
  /** The user's visibility setting; `isolate` overlays on top of it. */
  visible: boolean;
  opacity: number;
  transform: Matrix4Entries | null;
  /** What the surface is coloured by, and how hard the estimate is blurred before it is shown. */
  surface: LayerSurface;
  smoothing: number;
  /** Whether the thread already holds this layer's geometry. */
  measured: boolean;
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
  private readonly painter: SurfacePainter = createSurfacePainter();

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

    // Curvature is measured off the main thread; what comes back is turned into colours here.
    this.painter.onEvent(this.handleSurface);

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

    // White on its own, because the ramp that arrives in the vertex colours is the reading.
    const measuredMaterial = new MeshBasicMaterial({
      vertexColors: true,
      // The ramp was chosen by what it looks like on a screen, and a tone curve would print it as
      // something else again.
      toneMapped: false,
      side: DoubleSide,
    });

    const mesh: Mesh<BufferGeometry, SurfaceMaterial> = new Mesh(
      geometry,
      material,
    );
    mesh.name = spec.label;
    // Placement is composed by hand, so three must not overwrite it each frame.
    mesh.matrixAutoUpdate = false;

    return {
      id: spec.id,
      label: spec.label,
      colour: spec.colour,
      mesh,
      geometry,
      material,
      measuredMaterial,
      triangles: triangleCountOf(geometry),
      bounds: boundsOf(geometry),
      separationOffset: 0,
      visible: true,
      opacity: 1,
      transform: null,
      surface: "colour",
      smoothing: DEFAULT_SMOOTHING,
      measured: false,
    };
  }

  clearLayers(): void {
    for (const layer of this.layers.values()) {
      this.content.remove(layer.mesh);
      layer.geometry.dispose();
      layer.material.dispose();
      layer.measuredMaterial.dispose();
    }
    this.layers.clear();
    this.isolatedId = null;

    // Whatever the thread was measuring was measured from meshes that no longer exist, and a new
    // bundle's layers can reuse the same ids, so its work is stopped rather than inherited.
    this.painter.discard();
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
    const layer = this.layerFor(id);
    layer.colour = colour;
    // The map is shown through its own material, so this is ready for whenever the layer's own
    // colour is back on screen.
    layer.material.color.set(colour);
  }

  setLayerTransform(id: string, transform: Matrix4Entries | null): void {
    const layer = this.layerFor(id);
    layer.transform = transform;
    this.applyPlacement(layer);
  }

  setLayerSurface(id: string, surface: LayerSurface): void {
    const layer = this.layerFor(id);
    if (layer.surface === surface) return;

    layer.surface = surface;
    this.refreshSurface(layer);
  }

  setLayerSmoothing(id: string, smoothing: number): void {
    const layer = this.layerFor(id);
    const passes = clampSmoothing(smoothing);
    if (layer.smoothing === passes) return;

    layer.smoothing = passes;
    this.refreshSurface(layer);
  }

  /**
   * Spreads the layers apart, and pulls the camera back with them when they open.
   *
   * Being asked for the separation the layers already have is not a request to reframe: every
   * settings change comes through here, so reframing on each one would throw away a zoom or a pan
   * as soon as the user touched anything — switching the surface, moving an opacity slider,
   * soloing a layer.
   */
  setSeparation(factor: number): void {
    const wanted = Math.min(Math.max(factor, 0), 1);
    if (wanted === this.separationFactor) return;

    this.separationFactor = wanted;
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
    this.painter.dispose();
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

    for (const material of [layer.material, layer.measuredMaterial]) {
      material.opacity = layer.opacity;
      // See-through layers must not occlude each other, or the ones drawn first would
      // punch holes in the ones behind them.
      material.transparent = layer.opacity < 1;
      material.depthWrite = layer.opacity >= 1;
    }
  }

  /**
   * Asks for the layer's corners to be coloured by its surface, or puts its own colour back.
   *
   * The geometry goes to the thread the first time and is kept there, so changing the scalar — and
   * switching back to plain colour — costs no measuring at all. The measurement is deliberately
   * not thrown away when colour is shown again: a jaw is big enough that letting it go would turn
   * every toggle into a wait.
   */
  private refreshSurface(layer: RenderedLayer): void {
    if (layer.surface === "colour") {
      this.showOwnColour(layer);
      return;
    }

    const first = !layer.measured;
    layer.measured = true;
    this.painter.paint({
      id: layer.id,
      surface: layer.surface,
      smoothing: layer.smoothing,
      ...(first
        ? {
            geometry: {
              positions: cornersOf(layer.geometry),
              tolerance: toleranceOf(layer.bounds),
            },
          }
        : {}),
    });
  }

  /** Puts the layer back to its own colour, with nothing measured showing on it. */
  private showOwnColour(layer: RenderedLayer): void {
    layer.mesh.material = layer.material;
    layer.geometry.deleteAttribute("color");
  }

  /** Colours the layer's corners by what the thread measured, and shows them unlit. */
  private showMeasured(layer: RenderedLayer, colours: Float32Array): void {
    layer.geometry.setAttribute("color", new BufferAttribute(colours, 3));
    layer.mesh.material = layer.measuredMaterial;
  }

  private reportSurface(layer: RenderedLayer, state: SurfaceState): void {
    const { onSurface } = this.options;
    if (onSurface === undefined) return;

    const named = { id: layer.id, label: layer.label };
    switch (state.state) {
      case "measuring":
        onSurface({ ...named, state: "measuring" });
        return;
      case "painted":
        onSurface({
          ...named,
          state: "painted",
          milliseconds: state.milliseconds,
          scalar: state.scalar,
          range: state.range,
        });
        return;
      case "failed":
        onSurface({ ...named, state: "failed", reason: state.reason });
        return;
      default:
        return assertNever(state);
    }
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

  /**
   * Takes the colours the thread measured, or gives up on them.
   *
   * A reply can arrive for a scalar the user has already moved on from; what to do about that is
   * `replyFor`'s decision, and all that is left here is telling the renderer about it.
   */
  private readonly handleSurface = (event: SurfaceEvent): void => {
    const layer = this.layers.get(event.id);
    if (layer !== undefined) {
      this.applySurfaceReply(layer, replyFor(event, layer));
    }
  };

  private applySurfaceReply(layer: RenderedLayer, reply: SurfaceReply): void {
    switch (reply.kind) {
      case "ignore":
        return;
      case "measuring":
        this.reportSurface(layer, { state: "measuring" });
        return;
      case "measured":
        this.showMeasured(layer, reply.colours);
        this.reportSurface(layer, {
          state: "painted",
          milliseconds: reply.milliseconds,
          scalar: reply.surface,
          range: reply.range,
        });
        return;
      case "failed":
        // Nothing is on screen for this scalar, so the layer goes back to its own colour rather
        // than being left as it was mid-request, and another attempt is allowed to send the
        // geometry again. What the layer is asking for is left alone: the user asked for it, and
        // the status line says why it is not there.
        layer.measured = false;
        this.showOwnColour(layer);
        this.reportSurface(layer, { state: "failed", reason: reply.reason });
        return;
      default:
        assertNever(reply);
    }
  }

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

/**
 * The mesh's corners as a flat array, which is what the curvature fit welds into a surface.
 *
 * Read through the attribute rather than off its array, so nothing has to be assumed about how
 * three is holding them — and copied, because the thread takes the buffer away with it.
 */
function cornersOf(geometry: BufferGeometry): Float32Array {
  const attribute = geometry.getAttribute("position");
  const corners = new Float32Array(attribute.count * 3);

  for (let corner = 0; corner < attribute.count; corner += 1) {
    corners[corner * 3] = attribute.getX(corner);
    corners[corner * 3 + 1] = attribute.getY(corner);
    corners[corner * 3 + 2] = attribute.getZ(corner);
  }
  return corners;
}

/** How far apart two corners can be and still have been the same point to the scanner. */
function toleranceOf(bounds: Bounds): number {
  const span = Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  return span * WELD_FRACTION;
}
