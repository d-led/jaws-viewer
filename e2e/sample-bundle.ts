import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";

/**
 * Writes a small export to disk that looks like the real thing: two jaw scans, a closed-bite
 * scan, the case XML and the transform.
 *
 * The meshes are boxes rather than patients' teeth — enough for the viewer to frame, list and
 * draw — so the tests carry no patient data at all.
 */
export interface SampleBundle {
  /** Paths to hand to the file input. */
  readonly files: readonly string[];
  readonly patientName: string;
}

const BUNDLE_DIRECTORY = join(import.meta.dirname, ".bundle");

function sampleContents(): Readonly<Record<string, Uint8Array | string>> {
  return {
    "Case-UpperJaw.stl": boxStl(30, 12),
    "Case-LowerJaw.stl": boxStl(30, -12),
    "Case-TotalJaw0.stl": boxStl(12, 0),
    "Case.dentalProject": projectXml(),
    "Case.matrix4": matrix4Xml(),
  };
}

function asBytes(content: Uint8Array | string): Uint8Array {
  return typeof content === "string"
    ? new TextEncoder().encode(content)
    : content;
}

export async function writeSampleBundle(): Promise<SampleBundle> {
  await mkdir(BUNDLE_DIRECTORY, { recursive: true });

  const entries = Object.entries(sampleContents()).map(([name, content]) => ({
    path: join(BUNDLE_DIRECTORY, name),
    content,
  }));
  await Promise.all(
    entries.map((entry) => writeFile(entry.path, entry.content)),
  );

  return {
    files: entries.map((entry) => entry.path),
    patientName: "Redacted Test Patient",
  };
}

export interface SampleArchive {
  /** The export as the user would compress it: one file, the scans inside a folder. */
  readonly zip: string;
  /** The same bytes under a name that says nothing about being an archive. */
  readonly misnamed: string;
}

/**
 * The same export zipped up, which is how a phone hands over a whole folder — and the only
 * route to a bundle on iOS, where folder picking does not exist.
 */
export async function writeSampleArchive(): Promise<SampleArchive> {
  await mkdir(BUNDLE_DIRECTORY, { recursive: true });

  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(sampleContents())) {
    entries[`123_123_Example Practice/${name}`] = asBytes(content);
  }

  const zipped = zipSync(entries);
  const zip = join(BUNDLE_DIRECTORY, "export.zip");
  const misnamed = join(
    BUNDLE_DIRECTORY,
    "export-looks-like-a-project.dentalProject",
  );
  await writeFile(zip, zipped);
  await writeFile(misnamed, zipped);

  return { zip, misnamed };
}

/** A closed box on the occlusal axis, 12 triangles. */
function boxStl(half: number, centreZ: number): Uint8Array {
  const corners: Array<[number, number, number]> = [];
  for (const x of [-half, half]) {
    for (const y of [-half, half]) {
      for (const z of [-half, half]) corners.push([x, y, centreZ + z]);
    }
  }

  // Corner index for a sign triple is `x*4 + y*2 + z`, so these are the six faces.
  const quads = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ];

  const triangles: Array<
    [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ]
  > = [];
  for (const [a, b, c, d] of quads) {
    for (const [second, third] of [
      [b, c],
      [c, d],
    ] as const) {
      const first = corners[a ?? 0] ?? [0, 0, 0];
      triangles.push([
        first,
        corners[second ?? 0] ?? first,
        corners[third ?? 0] ?? first,
      ]);
    }
  }

  const bytes = new Uint8Array(84 + triangles.length * 50);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles.length, true);

  triangles.forEach(([a, b, c], index) => {
    // Layout per triangle: normal, three vertices, then a two-byte attribute count of zero.
    const base = 84 + index * 50;
    writeVector(view, base, faceNormal(a, b, c));
    writeVector(view, base + 12, a);
    writeVector(view, base + 24, b);
    writeVector(view, base + 36, c);
  });

  return bytes;
}

function faceNormal(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): [number, number, number] {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: [number, number, number] = [
    (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
    (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
    (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
  ];
  const length = Math.hypot(...n) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

function writeVector(
  view: DataView,
  offset: number,
  value: readonly [number, number, number],
): void {
  view.setFloat32(offset, value[0], true);
  view.setFloat32(offset + 4, value[1], true);
  view.setFloat32(offset + 8, value[2], true);
}

function projectXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Treatment UseRecipientMaterialConfiguration="true">',
    "\t<DateTime>2026-09-02T08:42:50</DateTime>",
    "\t<TrayNo>173</TrayNo>",
    "\t<Notes>Test bundle.</Notes>",
    "\t<Practice><PracticeId>003</PracticeId><PracticeName>Test Practice</PracticeName></Practice>",
    "\t<Patient><PatientId>173</PatientId><PatientName>Redacted Test Patient</PatientName></Patient>",
    "\t<ToothColor>A1</ToothColor>",
    "\t<AntagonistType>DigitalImpressionScan</AntagonistType>",
    "\t<MovementMarkerScan>false</MovementMarkerScan>",
    "\t<DentalDBProductName>[Version 3.0]</DentalDBProductName>",
    "</Treatment>",
  ].join("\r\n");
}

/** The shape a real export uses: translation in the last row. */
function matrix4Xml(): string {
  const values = [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 30, 0, -22.5, 1];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Matrix4>",
    ...values.map(
      (value, index) =>
        `    <_${Math.floor(index / 4)}${index % 4}>${value}</_${Math.floor(index / 4)}${index % 4}>`,
    ),
    "</Matrix4>",
  ].join("\n");
}
