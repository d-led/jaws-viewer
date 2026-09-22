import { zipSync } from "fflate";

export function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * A binary STL is an 80-byte header, a triangle count, then 50 bytes per triangle.
 * The header deliberately starts with the word "solid" because real exporters do that,
 * which is what makes extension- and keyword-based detection unreliable.
 */
export function binaryStl(
  triangleCount: number,
  header = "solid exported by a scanner",
): Uint8Array {
  const bytes = new Uint8Array(84 + triangleCount * 50);
  bytes.set(textBytes(header).subarray(0, 80), 0);
  new DataView(bytes.buffer).setUint32(80, triangleCount, true);
  return bytes;
}

export function asciiStl(triangleCount: number): Uint8Array {
  const facets =
    "facet normal 0 0 1\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 1 0\n endloop\nendfacet\n";
  return textBytes(
    `solid test\n${facets.repeat(triangleCount)}endsolid test\n`,
  );
}

export function zipOf(
  entries: Readonly<Record<string, Uint8Array | string>>,
): Uint8Array {
  const normalised: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(entries)) {
    normalised[path] =
      typeof content === "string" ? textBytes(content) : content;
  }
  return zipSync(normalised);
}

/** `matrix4Xml([1, 2, ... 16])` writes `<_00>1</_00>` through `<_33>16</_33>`. */
export function matrix4Xml(entries: readonly number[]): string {
  const rows = [0, 1, 2, 3].map((row) =>
    [0, 1, 2, 3]
      .map((column) => {
        const value = entries[row * 4 + column];
        return `    <_${row}${column}>${value ?? 0}</_${row}${column}>`;
      })
      .join("\n"),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Matrix4> \n${rows.join("\n")}\n</Matrix4>`;
}

export const PROJECT_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<Treatment UseRecipientMaterialConfiguration="true">',
  "\t<DateTime>2026-09-02T08:42:50</DateTime>",
  "\t<TrayNo>173</TrayNo>",
  "\t<Notes>Please make an adjusted night guard.",
  "XML 11-005033-1-3190-KB-1564-1-4",
  "Insertion on Friday at 8:30</Notes>",
  "\t<ProjectGUID>65333a21-29b5-42e2-bbf7-de2e79ef7c26</ProjectGUID>",
  "\t<Teeth/>",
  "\t<Practice>",
  "\t\t<PracticeId>003</PracticeId>",
  "\t\t<PracticeName>Dr. Example</PracticeName>",
  "\t</Practice>",
  "\t<Patient>",
  "\t\t<PatientId>173</PatientId>",
  "\t\t<PatientName>Test Patient </PatientName>",
  "\t</Patient>",
  "\t<ToothColor>A1</ToothColor>",
  "\t<AntagonistType>DigitalImpressionScan</AntagonistType>",
  "\t<MovementMarkerScan>false</MovementMarkerScan>",
  "\t<DentalDBProductName>[Version 3.0]</DentalDBProductName>",
  "</Treatment>",
].join("\r\n");

/** A minimal but complete export: metadata, a transform, and two scans. */
export const SAMPLE_BUNDLE_FILES: Readonly<
  Record<string, Uint8Array | string>
> = {
  "export/Case.dentalProject": PROJECT_XML,
  "export/Case.matrix4": matrix4Xml([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  ]),
  "export/Case-UpperJaw.stl": binaryStl(3),
  "export/Case-LowerJaw.stl": binaryStl(5),
};
