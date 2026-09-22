import type { Matrix4Entries } from "../domain/matrix4";
import {
  MalformedXmlError,
  requireRoot,
  textOf,
  type XmlDocument,
  type XmlNode,
} from "./xml";

const ROOT_ELEMENT = "Matrix4";

/**
 * Reads the 4x4 transform written as `<Matrix4><_00>…</_00>…</Matrix4>`.
 *
 * The values come back in file order and keep the file's row-vector convention; see
 * {@link Matrix4Entries}.
 */
export function parseMatrix4(document: XmlDocument): Matrix4Entries {
  requireRoot(document, ROOT_ELEMENT);
  const root = document.root;

  return [
    entry(root, 0, 0),
    entry(root, 0, 1),
    entry(root, 0, 2),
    entry(root, 0, 3),
    entry(root, 1, 0),
    entry(root, 1, 1),
    entry(root, 1, 2),
    entry(root, 1, 3),
    entry(root, 2, 0),
    entry(root, 2, 1),
    entry(root, 2, 2),
    entry(root, 2, 3),
    entry(root, 3, 0),
    entry(root, 3, 1),
    entry(root, 3, 2),
    entry(root, 3, 3),
  ];
}

function entry(root: XmlNode, row: number, column: number): number {
  const name = `_${row}${column}`;
  const raw = textOf(root, name);
  if (raw === null) {
    throw new MalformedXmlError(`The matrix is missing the <${name}> entry.`);
  }

  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new MalformedXmlError(
      `The matrix entry <${name}> is not a number ("${raw}").`,
    );
  }
  return value;
}
