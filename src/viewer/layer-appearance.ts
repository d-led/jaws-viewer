/** A layer as its own controls describe it: which one it is, and how the user wants it shown. */
export interface LayerLook {
  readonly id: string;
  readonly visible: boolean;
  /** 0 (invisible) to 1 (solid). */
  readonly opacity: number;
}

/** What the renderer is told about a layer. */
export interface LayerAppearance {
  /** Whether it is drawn: the user's switch, and nothing else in the way. */
  readonly visible: boolean;
  /**
   * See-through layers must not occlude each other, or the ones drawn first would punch holes in
   * the ones behind them.
   */
  readonly transparent: boolean;
  /** Only a solid layer hides what is behind it, so only a solid layer writes depth. */
  readonly depthWrite: boolean;
}

/**
 * How a layer is shown, given that `isolatedId` has been put on its own.
 *
 * Soloing does not touch the layer's own switch, because bringing the rest back has to restore
 * exactly what the user had — including the layers they had hidden themselves.
 */
export function appearanceOf(
  layer: LayerLook,
  isolatedId: string | null,
): LayerAppearance {
  const soloedOut = isolatedId !== null && isolatedId !== layer.id;

  return {
    visible: layer.visible && !soloedOut,
    transparent: layer.opacity < 1,
    depthWrite: layer.opacity >= 1,
  };
}
