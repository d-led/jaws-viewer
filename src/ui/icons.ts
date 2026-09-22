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

/**
 * Builds an icon as SVG rather than an emoji, so it inherits the text colour and stays crisp.
 *
 * Icons carry no text, so the button around them is what has to be named — see `iconButton`.
 */
export function icon(name: IconName): SVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  for (const path of ICON_PATHS[name]) {
    const element = document.createElementNS(SVG_NAMESPACE, "path");
    element.setAttribute("d", path);
    svg.append(element);
  }
  return svg;
}
