import { XMLParser, XMLValidator } from "fast-xml-parser";

/** A parsed element, keyed by child element name and `@_`-prefixed attribute name. */
export type XmlNode = Record<string, unknown>;

export interface XmlDocument {
  readonly rootName: string;
  readonly root: XmlNode;
}

export class MalformedXmlError extends Error {
  override readonly name = "MalformedXmlError";
}

export class UnexpectedRootElementError extends Error {
  override readonly name = "UnexpectedRootElementError";
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep every leaf as text: `<TrayNo>173</TrayNo>` must stay "173", not become 73, and
  // notes that contain numbers must never be coerced.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

/**
 * Parses an XML document and returns its root element.
 *
 * @throws {MalformedXmlError} when the text is not well-formed XML.
 */
export function parseXmlDocument(xml: string): XmlDocument {
  const source = stripByteOrderMark(xml);
  const validation = XMLValidator.validate(source);
  if (validation !== true) {
    throw new MalformedXmlError(validation.err.msg);
  }

  const parsed: unknown = parser.parse(source);
  if (!isRecord(parsed)) {
    throw new MalformedXmlError("The document has no root element.");
  }

  const rootName = Object.keys(parsed).find(isElementName);
  const root = rootName === undefined ? undefined : parsed[rootName];
  if (rootName === undefined || !isRecord(root)) {
    throw new MalformedXmlError("The document has no root element.");
  }

  return { rootName, root };
}

export function isRecord(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Asserts the document is the kind of file the caller is about to read.
 *
 * @throws {UnexpectedRootElementError}
 */
export function requireRoot(document: XmlDocument, expected: string): void {
  if (document.rootName !== expected) {
    throw new UnexpectedRootElementError(
      `Expected <${expected}> but found <${document.rootName}>.`,
    );
  }
}

/** The child element `name`, or `null` when it is absent or a leaf. */
export function childNode(parent: XmlNode, name: string): XmlNode | null {
  const value = parent[name];
  return isRecord(value) ? value : null;
}

/** The text of the leaf child `name`, or `null` when it is absent or empty. */
export function textOf(parent: XmlNode, name: string): string | null {
  const value = parent[name];
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return null;
}

export function booleanOf(parent: XmlNode, name: string): boolean | null {
  switch (textOf(parent, name)?.toLowerCase()) {
    case "true":
      return true;
    case "false":
      return false;
    default:
      return null;
  }
}

/** Attribute `name` on `parent` (written with the `@_` prefix by the parser). */
export function attributeOf(parent: XmlNode, name: string): string | null {
  return textOf(parent, `@_${name}`);
}

function isElementName(key: string): boolean {
  // `?xml` is the declaration, `#text` is a text node and `@_name` is an attribute; none
  // of them is the root element.
  return !key.startsWith("?") && !key.startsWith("#") && !key.startsWith("@_");
}

function stripByteOrderMark(xml: string): string {
  return xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
}
