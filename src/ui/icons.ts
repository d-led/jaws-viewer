export type IconName =
  "files" | "folder" | "fullscreen" | "exit" | "recentre" | "forget";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Each icon is a set of stroked paths on a 24x24 grid, so they all match in weight. */
const ICON_PATHS: Record<IconName, readonly string[]> = {
  // A scan sheet.
  files: ["M6 3h7l5 5v13H6z", "M13 3v5h5"],
  folder: [
    "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  ],
  fullscreen: ["M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5"],
  // The same frame with the arrow pointing back in.
  exit: ["M9 4h11v16H9", "M4 12h9", "M9.5 8.5 13 12l-3.5 3.5"],
  // A crosshair: put the model back in the middle of the frame.
  recentre: [
    "M12 3v3",
    "M12 18v3",
    "M3 12h3",
    "M18 12h3",
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  ],
  forget: [
    "M4 7h16",
    "M9 7V5h6v2",
    "M6 7l1 13h10l1-13",
    "M10 11v6",
    "M14 11v6",
  ],
};

/** GitHub's mark, as published in their 16x16 logo. */
const GITHUB_MARK =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z";

/**
 * Builds an icon as SVG rather than an emoji, so it inherits the text colour and stays crisp.
 *
 * Icons carry no text, so the button around them is what has to be named — see `iconButton`.
 */
export function icon(name: IconName): SVGElement {
  const element = svg(24);
  element.setAttribute("fill", "none");
  element.setAttribute("stroke", "currentColor");
  element.setAttribute("stroke-width", "1.7");
  element.setAttribute("stroke-linecap", "round");
  element.setAttribute("stroke-linejoin", "round");
  element.append(...ICON_PATHS[name].map((shape) => path(shape)));
  return element;
}

/**
 * The GitHub mark, for the link back to the source.
 *
 * Kept out of `ICON_PATHS` because it is a different kind of artwork: those are stroked outlines on
 * a 24x24 grid, while this is a filled logo — its silhouette is the shape, rather than a line drawn
 * round one — on the 16x16 grid GitHub publishes it on.
 */
export function githubMark(): SVGElement {
  const element = svg(16);
  element.setAttribute("fill", "currentColor");
  element.append(path(GITHUB_MARK));
  return element;
}

/** An SVG element `size` px on its own square grid, hidden from assistive tech. */
function svg(size: number): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, "svg");
  element.setAttribute("viewBox", `0 0 ${size} ${size}`);
  element.setAttribute("width", String(size));
  element.setAttribute("height", String(size));
  element.setAttribute("aria-hidden", "true");
  return element;
}

function path(shape: string): SVGPathElement {
  const element = document.createElementNS(SVG_NAMESPACE, "path");
  element.setAttribute("d", shape);
  return element;
}
