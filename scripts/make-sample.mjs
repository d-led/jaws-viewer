#!/usr/bin/env node
// Writes the sample bundle that ships with the viewer, into public/sample/.
//
// The geometry is generated here rather than taken from a public dental dataset on purpose.
// Real intraoral scans come from research benchmarks whose licences are bespoke data-use
// agreements (Teeth3DS ships a 19 kB license.txt and OSF records it as "Other"), so they cannot
// be redistributed with a public site. Everything in this bundle is authored here, so it is ours
// to publish — and it is a stylised arch rather than a recording of anyone's mouth, so nobody
// mistakes it for a patient.
//
// Run: node scripts/make-sample.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUTPUT = join(import.meta.dirname, "..", "public", "sample");
const HEADER_BYTES = 84;
const TRIANGLE_BYTES = 50;

/** A point three floats wide, as STL stores them. */
function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function normal([a, b, c]) {
  const [ux, uy, uz] = subtract(b, a);
  const [vx, vy, vz] = subtract(c, a);
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const length = Math.hypot(...n) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

function distance(a, b) {
  return Math.hypot(...subtract(a, b));
}

function scaled(vector, factor) {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function mix(from, to, t) {
  return from + (to - from) * t;
}

/** A unit copy, which is what a direction needs before it can be used as an axis. */
function normalise(vector) {
  return scaled(vector, 1 / (Math.hypot(...vector) || 1));
}

/** Flips a point or a direction across the midline of the arch. */
function mirrorX([x, y, z]) {
  return [-x, y, z];
}

/**
 * Turns a triangle to face away from `inside`: a point on the far side of the sheet it belongs to.
 *
 * Every sheet here wraps round a line or a point, so one reference is enough to turn every triangle
 * the right way out — nothing has to reason about how a triangle happened to be wound.
 */
function facingOut([a, b, c], inside) {
  const normalVector = normal([a, b, c]);
  const middle = [
    (a[0] + b[0] + c[0]) / 3 - inside[0],
    (a[1] + b[1] + c[1]) / 3 - inside[1],
    (a[2] + b[2] + c[2]) / 3 - inside[2],
  ];
  const outward =
    normalVector[0] * middle[0] +
    normalVector[1] * middle[1] +
    normalVector[2] * middle[2];
  return outward >= 0 ? [a, b, c] : [a, c, b];
}

// -------------------------------------------------------------------- surfaces

/** The band of quads between two neighbouring rings. */
function band(lower, upper, inside) {
  const triangles = [];
  for (let segment = 0; segment < lower.length; segment += 1) {
    const next = (segment + 1) % lower.length;
    triangles.push(
      [lower[segment], upper[segment], upper[next]],
      [lower[segment], upper[next], lower[next]],
    );
  }
  return triangles.map((triangle) => facingOut(triangle, inside));
}

/**
 * The quads between neighbouring columns of a grid, each turned away from the point `inside` gives
 * for that column.
 *
 * A scan is one sheet like this. Nothing is closed off anywhere: it ends at the line the model was
 * trimmed along, the way a real one does, and you can see straight through it from behind.
 */
function sheet(columns, inside) {
  const triangles = [];
  for (let column = 0; column + 1 < columns.length; column += 1) {
    triangles.push(
      ...band(columns[column], columns[column + 1], inside(column)),
    );
  }
  return triangles;
}

/** A smooth bump: 1 at `at`, 0 once `half` away from it, and rounded in between. */
function bump(value, at, half) {
  const away = Math.abs(value - at) / half;
  return away >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * away);
}

/** The closest any of `points` comes to `value`, on the same scale as `bump`. */
function closest(points, value, half) {
  let nearest = 0;
  for (const point of points) {
    const proximity = bump(value, point, half);
    if (proximity > nearest) nearest = proximity;
  }
  return nearest;
}

// ------------------------------------------------------------ the arch surface

/**
 * A jaw is one continuous sheet: up the cheek side of every tooth, over the biting surfaces, back
 * down the tongue side, cut off along the gum line and open there.
 *
 * What makes it read as teeth is the detail carried along it — how tall each crown is, how deep
 * the section runs through it, the groove between a molar's own cusps, and the V of gum where two
 * neighbours meet. `phi` runs round the section: 0 at the cheek-side gum line, 0.5 over the bite,
 * 1 at the tongue-side one.
 */
const ARCH_STATIONS = 560;
const SECTION_ROWS = 34;

/** 1 draws an oval section, lower squares it off: steeper walls, a flatter biting surface. */
const SECTION_SQUARENESS = 0.6;

/** How much narrower the section is where it leaves the gum than at the contact above it. */
const GUM_NECK = 0.7;

/** The dips in a biting surface: between one tooth's own cusps, and between two neighbours. */
const FOSSA = 0.13;
const FOSSA_WIDTH = 2.8;
const MARGIN = 0.1;
const EMBRASURE = 0.55;
const EMBRASURE_WIDTH = 2.2;

/** How far the trim climbs between two teeth, where the gum line runs up into the embrasure. */
const GUM_SCALLOP = 0.6;

/** Which way is out of the mouth at a point on the arch: towards the cheek, across the teeth. */
function cheekSide(tangent, side) {
  return side > 0 ? [tangent[1], -tangent[0], 0] : [-tangent[1], tangent[0], 0];
}

/**
 * The tooth the arch is under at a point along it, sized between the two that bracket the point so
 * that nothing steps from one tooth to the next.
 */
function toothAt(teeth, along) {
  for (let index = 1; index < teeth.length; index += 1) {
    const before = teeth[index - 1];
    const after = teeth[index];
    if (along > after.at) continue;

    const t = Math.min(
      Math.max((along - before.at) / (after.at - before.at), 0),
      1,
    );
    return {
      height: mix(before.height, after.height, t),
      halfDepth: mix(before.depth, after.depth, t) / 2,
      cusps: t < 0.5 ? before.cusps : after.cusps,
    };
  }

  const last = teeth[teeth.length - 1];
  return { height: last.height, halfDepth: last.depth / 2, cusps: last.cusps };
}

/** The points along the arch a biting surface dips at: between cusps, and between neighbours. */
function grooves(teeth) {
  return {
    fossae: teeth.filter((tooth) => tooth.cusps > 0).map((tooth) => tooth.at),
    embrasures: teeth
      .slice(1)
      .map((tooth, index) => (tooth.at + teeth[index].at) / 2),
  };
}

/** Everything a layer needs to know about the arch it is cut from. */
function archFit(curve, teeth, halfOverlap) {
  return { curve, teeth, halfOverlap, ...grooves(teeth) };
}

/** How high a biting surface stands at a point along the arch: up at the cusps, down in the dips. */
function crestRelief(fit, along) {
  return (
    1 -
    FOSSA * closest(fit.fossae, along, FOSSA_WIDTH) -
    MARGIN * closest(fit.embrasures, along, EMBRASURE_WIDTH)
  );
}

/**
 * The V of gum where two neighbours meet, as a share: 1 in the middle of a tooth, 0 in the dip
 * between two. The trim climbs into those dips and the crowns part above them, so it is read once
 * and used for both.
 */
function embrasureAt(fit, along) {
  return closest(fit.embrasures, along, EMBRASURE_WIDTH);
}

/** How far a jaw's gum line sits from the occlusal plane at a point along the arch. */
function trimAt(fit, along) {
  return (
    toothAt(fit.teeth, along).height -
    fit.halfOverlap -
    GUM_SCALLOP * embrasureAt(fit, along)
  );
}

/**
 * How far the cheek side of a jaw stands out `rise` of the way from its gum line to its bite.
 *
 * Narrow at the gum, broad at the contact above it, and parted by the embrasure in between: that
 * is the shape that tells one tooth from the next, and it is read here for both the jaw and the
 * cheek-side scan, which is the same surface held a little further out.
 */
function standAt(fit, along, rise) {
  const tooth = toothAt(fit.teeth, along);
  const sin = Math.min(1, rise) ** (1 / SECTION_SQUARENESS);
  return (
    tooth.halfDepth *
    mix(GUM_NECK, 1, rise) *
    (1 - EMBRASURE * embrasureAt(fit, along) * (1 - rise)) *
    (1 - sin * sin) ** (SECTION_SQUARENESS / 2)
  );
}

/** How high a jaw's section is `rise` of the way up it, measured from the occlusal plane. */
function heightAt(fit, side, along, rise) {
  return (
    side *
    (trimAt(fit, along) -
      toothAt(fit.teeth, along).height * rise * crestRelief(fit, along))
  );
}

/** One point on a jaw: `along` down the arch, `phi` round the section of the tooth row. */
function jawPoint(fit, side, along, phi) {
  const half = Math.PI * phi;
  const rise = Math.abs(Math.sin(half)) ** SECTION_SQUARENESS;
  // Positive phi runs up the cheek side, negative the tongue side.
  const lane = Math.sign(Math.cos(half)) === 1 ? 1 : -1;
  return placePoint(fit, side, along, rise, lane);
}

/** One point on a jaw's surface, `rise` up the section, `lane` in from either side. */
function placePoint(fit, side, along, rise, lane) {
  const { position, tangent } = fit.curve.at(along);
  const cheek = cheekSide(tangent, side);
  const across = standAt(fit, along, rise) * lane;
  return [
    position[0] + cheek[0] * across,
    position[1] + cheek[1] * across,
    heightAt(fit, side, along, rise),
  ];
}

/** One jaw: the whole arch as a single sheet, open along the gum line where it was cut off. */
function jawSurface(fit, side) {
  const last = fit.teeth[fit.teeth.length - 1];
  const reach = last.at + last.width / 2;
  const columns = [];

  for (let column = 0; column <= ARCH_STATIONS; column += 1) {
    const along = mix(-reach, reach, column / ARCH_STATIONS);
    const points = [];
    for (let row = 0; row <= SECTION_ROWS; row += 1) {
      points.push(jawPoint(fit, side, along, row / SECTION_ROWS));
    }
    columns.push({ points, inside: fit.curve.at(along).position });
  }

  return sheet(
    columns.map((column) => column.points),
    (column) => columns[column].inside,
  );
}

// ------------------------------------------------------------------------ arch

/**
 * The curve the whole sample stands on: an ellipse opening towards +Y, the back of the mouth in
 * scan space. Both jaws and the wafer are laid out on this one curve, which is what makes the
 * three parts line up when the bite is closed.
 */
const ARCH_HALF_WIDTH = 32;
const ARCH_DEPTH = 54;
const ARCH_SWEEP = 1.35;
const ARCH_SAMPLES = 1200;

function archPoint(angle) {
  return {
    position: [
      ARCH_HALF_WIDTH * Math.sin(angle),
      ARCH_DEPTH * (1 - Math.cos(angle)),
      0,
    ],
    // Which way the arch is heading there, so a tooth can be turned to sit across it.
    tangent: normalise([
      ARCH_HALF_WIDTH * Math.cos(angle),
      ARCH_DEPTH * Math.sin(angle),
      0,
    ]),
  };
}

/** The arch point a given distance along, taken between the two samples bracketing it. */
function archSampleAt(samples, along) {
  let index = 0;
  while (index + 1 < samples.length && samples[index + 1].length < along)
    index += 1;

  const before = samples[index];
  const after = samples[Math.min(index + 1, samples.length - 1)];
  const span = after.length - before.length;
  const t = span === 0 ? 0 : (along - before.length) / span;

  return {
    position: before.position.map((value, axis) =>
      mix(value, after.position[axis], t),
    ),
    tangent: normalise(
      before.tangent.map((value, axis) => mix(value, after.tangent[axis], t)),
    ),
  };
}

/**
 * The arch measured by length rather than by angle, because teeth are spaced by how wide they
 * are. `at` walks the curve outwards from the midline; a negative distance mirrors to the other
 * side, so both sides are laid out from the one curve.
 */
function archCurve() {
  const samples = [];
  let length = 0;
  for (let step = 0; step <= ARCH_SAMPLES; step += 1) {
    const point = archPoint((step / ARCH_SAMPLES) * ARCH_SWEEP);
    if (step > 0)
      length += distance(samples[step - 1].position, point.position);
    samples.push({ ...point, length });
  }

  return {
    length,
    at(along) {
      const point = archSampleAt(samples, Math.abs(along));
      return along < 0
        ? { position: mirrorX(point.position), tangent: mirrorX(point.tangent) }
        : point;
    },
  };
}

// ------------------------------------------------------------------ dentition

/**
 * The teeth of one side, front to back: how wide each is across the arch, how deep through it, how
 * tall, and how many cusps stand on its biting surface. These are a real dentition's millimetres,
 * scaled below to fit the arch they have to fill.
 *
 * Width and depth together decide the shape of a tooth, and nothing else needs saying: a narrow
 * deep section cuts like a chisel, a broad one grinds like a table.
 */
const DENTITION = [
  { width: 8.5, depth: 6.2, height: 9.2, cusps: 0 },
  { width: 6.6, depth: 6.1, height: 8.9, cusps: 0 },
  { width: 7.6, depth: 7.9, height: 9.4, cusps: 0 },
  { width: 7.2, depth: 9.1, height: 8.6, cusps: 2 },
  { width: 7.0, depth: 9.3, height: 8.4, cusps: 2 },
  { width: 11.0, depth: 10.5, height: 8.2, cusps: 4 },
  { width: 10.4, depth: 10.1, height: 8.0, cusps: 4 },
];

/**
 * Teeth of an arch stand in contact, so the layout runs them a hair into one another: crowns are
 * widest just below the bite, which is where neighbours meet.
 */
const DENTITION_FILL = 1.02;
/**
 * Every tooth of the arch, sized so they fill it exactly — the arch is only as long as the teeth
 * standing on it. Returned in the order they run along the arch, from one second molar to the
 * other.
 */
function dentition(curve) {
  const total = DENTITION.reduce((sum, tooth) => sum + tooth.width, 0);
  const scale = (curve.length * DENTITION_FILL) / total;
  let along = (curve.length * (1 - DENTITION_FILL)) / 2;
  const right = [];

  for (const tooth of DENTITION) {
    const width = tooth.width * scale;
    const depth = tooth.depth * scale;
    right.push({
      at: along + width / 2,
      width,
      depth,
      height: tooth.height * scale,
      cusps: tooth.cusps,
    });
    along += width;
  }

  // The arch runs from one second molar to the other, so the other side is this list mirrored.
  const left = right.map((tooth) => ({ ...tooth, at: -tooth.at }));
  return [...left, ...right].toSorted((a, b) => a.at - b.at);
}

// ------------------------------------------------------- the closed-bite scans

/**
 * The closed-bite scans: what an export calls TotalJaw. They are not a layer between the jaws.
 *
 * A scanner sees one cheek at a time, so there is one of these per side, and each carries the
 * cheek-side surface of both arches at once — from below the lower gum line to above the upper
 * one. That is exactly the surface the two occlusal scans leave undercut, which is what makes
 * these complementary to the jaws rather than something in the middle.
 *
 * Each is the same section as the jaws, held a little further out, so it follows the teeth it
 * covers and overlaps them the way the real scans overlap each other.
 */
const PATCH_STATIONS = 150;
const PATCH_ROWS = 26;
const PATCH_GAP = 0.4;

/**
 * How far a jaw's cheek side stands out at a height: the same wall the jaw is made of, read back
 * the other way — from the height instead of from the rise up it.
 */
function standAtHeight(fit, side, along, z) {
  const tooth = toothAt(fit.teeth, along);
  const rise = Math.min(
    Math.max(
      (trimAt(fit, along) - side * z) /
        (tooth.height * crestRelief(fit, along)),
      0,
    ),
    1,
  );
  return standAt(fit, along, rise);
}

/**
 * One point on the closed bite's cheek side. Above the occlusal plane it is the upper jaw's wall,
 * below it the lower one's: they run into each other in between, so the outer one carries both.
 */
function cheekPoint(fit, side, along, z) {
  const { position, tangent } = fit.curve.at(along);
  const cheek = cheekSide(tangent, side);
  const jaw = z < 0 ? LOWER_JAW : UPPER_JAW;
  const away = standAtHeight(fit, jaw, along, z) + PATCH_GAP;
  return [position[0] + cheek[0] * away, position[1] + cheek[1] * away, z];
}

function closedBiteScan(fit, side, { from, to }) {
  const columns = [];

  for (let column = 0; column <= PATCH_STATIONS; column += 1) {
    const along = mix(from, to, column / PATCH_STATIONS);
    const reach = trimAt(fit, along);
    const points = [];

    for (let row = 0; row <= PATCH_ROWS; row += 1) {
      const z = mix(-reach, reach, row / PATCH_ROWS);
      points.push(cheekPoint(fit, side, along, z));
    }
    columns.push({ points, inside: fit.curve.at(along).position });
  }

  return sheet(
    columns.map((column) => column.points),
    (column) => columns[column].inside,
  );
}

function stlFile(triangles) {
  const bytes = new Uint8Array(
    HEADER_BYTES + triangles.length * TRIANGLE_BYTES,
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles.length, true);

  triangles.forEach(([a, b, c], index) => {
    const base = HEADER_BYTES + index * TRIANGLE_BYTES;
    writeVector(view, base, normal([a, b, c]));
    writeVector(view, base + 12, a);
    writeVector(view, base + 24, b);
    writeVector(view, base + 36, c);
  });
  return bytes;
}

function writeVector(view, offset, [x, y, z]) {
  view.setFloat32(offset, x, true);
  view.setFloat32(offset + 4, y, true);
  view.setFloat32(offset + 8, z, true);
}

// The sample case: a pair of jaws and the two cheek-side scans of their closed bite, named the
// way an export names its files so the viewer labels and colours them as it would real ones.
const PROJECT_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<Treatment UseRecipientMaterialConfiguration="true">',
  "\t<DateTime>2026-09-02T08:42:50</DateTime>",
  "\t<TrayNo>1</TrayNo>",
  "\t<Notes>Generated sample, not a patient. It ships with the viewer so the tool can be tried without an export of your own.</Notes>",
  "\t<ProjectGUID>00000000-0000-4000-8000-000000000001</ProjectGUID>",
  "\t<Teeth/>",
  "\t<Practice><PracticeId>001</PracticeId><PracticeName>Sample Practice</PracticeName></Practice>",
  "\t<Patient><PatientId>1</PatientId><PatientName>Sample Patient</PatientName></Patient>",
  "\t<ToothColor>A2</ToothColor>",
  "\t<AntagonistType>DigitalImpressionScan</AntagonistType>",
  "\t<MovementMarkerScan>false</MovementMarkerScan>",
  "\t<DentalDBProductName>[Version 3.0]</DentalDBProductName>",
  "</Treatment>",
].join("\r\n");

/** Translation in the last row, the way a real export writes it. */
function matrix4Xml() {
  const values = [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 4, 0, -3, 1];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Matrix4>",
    ...values.map((value, index) => {
      const cell = `_${Math.floor(index / 4)}${index % 4}`;
      return `    <${cell}>${value}</${cell}>`;
    }),
    "</Matrix4>",
  ].join("\n");
}

/**
 * The case: one arch, its teeth, and the layers an export splits them into. The jaws are the same
 * teeth mirrored about the occlusal plane, so they close on one another — running a few
 * millimetres into each other the way scans of a closed bite do, rather than meeting at a plane.
 */
const curve = archCurve();
const teeth = dentition(curve);

/**
 * How far the two jaws run into each other at the bite, in millimetres. Enough to look like the
 * real thing, where each jaw was scanned with the teeth together and so carries the occlusal
 * third of the teeth on both sides.
 */
const BITE_OVERLAP = 4;
const halfOverlap = BITE_OVERLAP / 2;

/** Which way each jaw grows away from the occlusal plane: up for the upper, down for the lower. */
const UPPER_JAW = 1;
const LOWER_JAW = -1;

/** The two halves of the arch, under the names the export gives them: TotalJaw0 is the left. */
const LEFT_SIDE = -1;
const RIGHT_SIDE = 1;
const CHEEK_FIRST = 2;

const fit = archFit(curve, teeth, halfOverlap);
const rightSide = teeth.filter((tooth) => tooth.at > 0);
const cheekFrom = rightSide[CHEEK_FIRST].at - rightSide[CHEEK_FIRST].width / 2;
const cheekTo =
  rightSide[rightSide.length - 1].at +
  rightSide[rightSide.length - 1].width / 2;

const jaws = {
  "sample-UpperJaw.stl": jawSurface(fit, UPPER_JAW),
  "sample-LowerJaw.stl": jawSurface(fit, LOWER_JAW),
  "sample-TotalJaw0.stl": closedBiteScan(fit, LEFT_SIDE, {
    from: -cheekTo,
    to: -cheekFrom,
  }),
  "sample-TotalJaw1.stl": closedBiteScan(fit, RIGHT_SIDE, {
    from: cheekFrom,
    to: cheekTo,
  }),
};

const triangleCount = Object.values(jaws).reduce(
  (sum, triangles) => sum + triangles.length,
  0,
);

/** The files the viewer should read, in the order it lists them. */
const bundleFiles = [
  ...Object.keys(jaws),
  "sample.dentalProject",
  "sample.matrix4",
];

// Where this came from, shipped beside the data so the bundle explains itself.
const PROVENANCE = `# Sample bundle

**Generated, not scanned.** Nothing here came off a patient: \`scripts/make-sample.mjs\` draws
every mesh, and running it again rewrites them all.

Two jaws of fourteen teeth, and the two cheek-side scans of their closed bite. The jaws overlap at
the bite rather than meeting at a plane, and the cheek-side scans carry both arches at once, the
way real ones do. Every layer is a surface, not a solid, and open along the line it was cut off
at.

Generated rather than borrowed, because the public intraoral scan benchmarks are research data-use
agreements rather than open licences, and none of them can ship with a published viewer.

The file names follow the convention an exocad export uses, so the viewer labels, colours and
groups them exactly as it would a real case.
`;

const contents = {
  ...Object.fromEntries(
    Object.entries(jaws).map(([name, triangles]) => [name, stlFile(triangles)]),
  ),
  "sample.dentalProject": PROJECT_XML,
  "sample.matrix4": matrix4Xml(),
  // The index lists only what the viewer reads, so the README beside it is never parsed.
  "index.json": `${JSON.stringify({ files: bundleFiles }, null, 2)}\n`,
  "README.md": PROVENANCE,
};

await mkdir(OUTPUT, { recursive: true });
await Promise.all(
  Object.entries(contents).map(([name, content]) =>
    writeFile(join(OUTPUT, name), content),
  ),
);
console.log(
  `wrote ${Object.keys(contents).length} files and ` +
    `${triangleCount.toLocaleString()} triangles to public/sample/`,
);
