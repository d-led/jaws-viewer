export type Rgb = readonly [number, number, number];

/** A stop on a ramp: where it sits, and the colour a screen shows there. */
interface Stop {
  readonly at: number;
  readonly colour: Rgb;
}

/**
 * Groove through flat to cusp, in the colours a curvature map is normally drawn in.
 *
 * The ends are lifted a little from the textbook coolwarm pair, which is chosen against a white
 * page: on this viewer's dark stage a deep blue and a deep red lose their edges.
 */
const DIVERGING: readonly Stop[] = [
  { at: -1, colour: [0.24, 0.4, 0.9] },
  { at: -0.5, colour: [0.55, 0.69, 0.99] },
  { at: 0, colour: [0.88, 0.88, 0.88] },
  { at: 0.5, colour: [0.96, 0.6, 0.48] },
  { at: 1, colour: [0.85, 0.13, 0.15] },
];

/**
 * Nothing through everything, for the scalars that have no zero worth showing.
 *
 * There is no middle for such a scalar to be at, so the ramp has none either: it runs cold to
 * warm, which is the reading a heat map has taught everyone to take.
 */
const SEQUENTIAL: readonly Stop[] = [
  { at: 0, colour: [0.2, 0.42, 0.88] },
  { at: 0.5, colour: [0.62, 0.32, 0.86] },
  { at: 1, colour: [0.84, 0.16, 0.18] },
];

/**
 * The colour for a curvature: −1 a groove, 0 flat and +1 a cusp for a signed scalar, or 0 through
 * 1 for a magnitude.
 *
 * The stops above are written the way a screen shows them, which is how they were chosen, and the
 * answer is handed back in the linear light a renderer works in — vertex colours are taken as they
 * come, with no transfer applied to them. Leaving that out washes the ramp out to pastel: a stop
 * then displays as 0.97 rather than as the 0.92 it was chosen to be.
 */
export function curvatureColour(t: number, signed: boolean): Rgb {
  const value = Math.min(Math.max(t, -1), 1);
  const [r, g, b] = read(scaleFor(signed), value);

  return [linear(r), linear(g), linear(b)];
}

/**
 * The same ramp as a CSS gradient, so that a legend is drawn from the stops the surface is drawn
 * from rather than from a second copy of them.
 *
 * Written in the colours a screen shows, which is what CSS means by a colour — and what the surface
 * ends up showing, the transfer on the stops cancelling the one the renderer applies.
 */
export function rampGradient(signed: boolean): string {
  const stops = scaleFor(signed);
  const first = stops[0]!.at;
  const last = stops.at(-1)!.at;
  const parts = stops.map((stop) => {
    const position = ((stop.at - first) / (last - first)) * 100;
    return `${cssColour(stop.colour)} ${position.toFixed(1)}%`;
  });

  return `linear-gradient(to right, ${parts.join(", ")})`;
}

/** A signed scalar is read across the whole ramp; a magnitude across one that has no middle. */
function scaleFor(signed: boolean): readonly Stop[] {
  return signed ? DIVERGING : SEQUENTIAL;
}

/** Walks the stops to find the pair a value falls between, and mixes across it. */
function read(stops: readonly Stop[], value: number): Rgb {
  for (let i = 1; i < stops.length; i += 1) {
    const from = stops[i - 1]!;
    const to = stops[i]!;
    if (value > to.at) continue;

    const span = to.at - from.at;
    const amount = span === 0 ? 0 : (value - from.at) / span;
    return mix(from.colour, to.colour, Math.min(Math.max(amount, 0), 1));
  }
  return stops.at(-1)!.colour;
}

function cssColour([r, g, b]: Rgb): string {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

/** The sRGB transfer function, applied backwards: what a screen does, undone. */
function linear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}
