import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { BundleFile } from "../src/io/bundle-file";
import { compactFiles, isStoredFiles } from "../src/io/session-store";
import { createIndexedDbSessionStore } from "../src/io/indexeddb-session-store";
import { sniffBundleFile } from "../src/parsing/sniff";
import { readStlTriangleCount } from "../src/parsing/stl";
import { binaryStl, textBytes } from "./fixtures";

const store = createIndexedDbSessionStore();

const VIEW = {
  separation: 0.6,
  layers: {
    "Case-UpperJaw.stl": {
      visible: false,
      opacity: 0.35,
      colour: "#ff8800",
      placedByMatrix: true,
    },
  },
};

async function restoredFiles(): Promise<readonly BundleFile[]> {
  const files = await store.readFiles();
  if (files === null) throw new Error("Nothing was stored.");
  return files;
}

async function restoredFile(index = 0): Promise<BundleFile> {
  const file = (await restoredFiles())[index];
  if (file === undefined) throw new Error(`Nothing was stored at ${index}.`);
  return file;
}

beforeEach(async () => {
  await store.forget();
});

describe("the stored files", () => {
  it("hold nothing until something is saved", async () => {
    expect(await store.readFiles()).toBeNull();
  });

  it("come back exactly as they went in", async () => {
    await store.saveFiles([
      { path: "Case.dentalProject", bytes: textBytes("<Treatment/>") },
    ]);

    expect(await restoredFiles()).toEqual([
      { path: "Case.dentalProject", bytes: textBytes("<Treatment/>") },
    ]);
  });

  it("keep mesh bytes intact, all the way back", async () => {
    const stl = binaryStl(4711);
    await store.saveFiles([{ path: "Case-UpperJaw.stl", bytes: stl }]);

    const restored = await restoredFile();
    expect(restored.bytes).toEqual(stl);
    expect(sniffBundleFile(restored.bytes)).toBe("binary-stl");
    expect(readStlTriangleCount(restored.bytes, "binary-stl")).toBe(4711);
  });

  it("are replaced rather than added to", async () => {
    await store.saveFiles([{ path: "first.stl", bytes: binaryStl(1) }]);
    await store.saveFiles([{ path: "second.stl", bytes: binaryStl(2) }]);

    expect((await restoredFiles()).map((file) => file.path)).toEqual([
      "second.stl",
    ]);
  });
});

describe("the stored view", () => {
  it("holds nothing until something is saved", async () => {
    expect(await store.readView()).toBeNull();
  });

  it("comes back with every layer setting intact", async () => {
    await store.saveView(VIEW);

    expect(await store.readView()).toEqual(VIEW);
  });

  it("does not disturb the stored files", async () => {
    await store.saveFiles([{ path: "Case-UpperJaw.stl", bytes: binaryStl(3) }]);
    await store.saveView(VIEW);

    expect((await restoredFiles()).map((file) => file.path)).toEqual([
      "Case-UpperJaw.stl",
    ]);
  });

  it("is dropped when the session is forgotten", async () => {
    await store.saveFiles([{ path: "Case-UpperJaw.stl", bytes: binaryStl(3) }]);
    await store.saveView(VIEW);

    await store.forget();

    expect(await store.readFiles()).toBeNull();
    expect(await store.readView()).toBeNull();
  });
});

describe("compacting files for storage", () => {
  it("gives each file a buffer of its own", () => {
    const shared = new Uint8Array(4096);
    shared.set(textBytes("hello"), 2048);

    const [compacted] = compactFiles([
      { path: "a.txt", bytes: shared.subarray(2048, 2053) },
    ]);

    expect(compacted?.bytes.byteLength).toBe(5);
    expect(compacted?.bytes.byteOffset).toBe(0);
    // Not still looking into the 4096-byte buffer it was cut from.
    expect(compacted?.bytes.buffer.byteLength).toBe(5);
  });

  it("keeps the paths", () => {
    expect(
      compactFiles([{ path: "export/Case.stl", bytes: textBytes("x") }]),
    ).toEqual([{ path: "export/Case.stl", bytes: textBytes("x") }]);
  });
});

describe("reading back a stored record of files", () => {
  it("accepts what this version writes", () => {
    expect(isStoredFiles([{ path: "a.stl", bytes: new Uint8Array(1) }])).toBe(
      true,
    );
    expect(isStoredFiles([])).toBe(true);
  });

  it("refuses anything else rather than passing it to the reader", () => {
    expect(isStoredFiles(null)).toBe(false);
    expect(isStoredFiles("not a bundle")).toBe(false);
    expect(isStoredFiles([{ path: "a.stl" }])).toBe(false);
    expect(isStoredFiles([{ path: "a.stl", bytes: "text" }])).toBe(false);
    expect(isStoredFiles([{ bytes: new Uint8Array(1) }])).toBe(false);
  });
});
