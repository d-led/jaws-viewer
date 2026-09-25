import {
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  type Object3D,
} from "three";

/** How long the mark stays up: long enough to catch the eye, short enough to be out of the way. */
export const FLASH_MS = 1200;

/** The mark's radius as a fraction of the extent of what it marks. */
const RADIUS_FRACTION = 0.02;

/** The mark's colour, which nothing in a scan is. */
const MARK_COLOUR = 0xffd166;

export interface OrbitCentreMarker {
  readonly object: Object3D;
  /** Marks `centre`, sized against the extent of what is being looked at, and flashes it. */
  flash(centre: Vector3, extent: number): void;
  dispose(): void;
}

/**
 * A small sphere flashed where the orbit centre has been put.
 *
 * Setting the centre moves nothing on screen — that is the whole point of it — so a mark is the only
 * way to see where it went. It is drawn over the model rather than in it, because the centre sits at
 * the depth of the surface that was pressed and can easily be inside whatever stands in front of it.
 */
export function createOrbitCentreMarker(): OrbitCentreMarker {
  const geometry = new SphereGeometry(1, 16, 12);
  const material = new MeshBasicMaterial({
    color: MARK_COLOUR,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });

  const sphere = new Mesh(geometry, material);
  sphere.renderOrder = 1;
  sphere.visible = false;

  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    object: sphere,
    flash: (centre, extent) => {
      sphere.position.copy(centre);
      sphere.scale.setScalar(extent * RADIUS_FRACTION);
      sphere.visible = true;

      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        sphere.visible = false;
        timer = null;
      }, FLASH_MS);
    },
    dispose: () => {
      if (timer !== null) clearTimeout(timer);
      geometry.dispose();
      material.dispose();
    },
  };
}
