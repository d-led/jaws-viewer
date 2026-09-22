import { describe, expect, it } from "vitest";
import { parseDentalProject } from "../src/parsing/dental-project-parser";
import {
  UnexpectedRootElementError,
  parseXmlDocument,
} from "../src/parsing/xml";
import { PROJECT_XML, matrix4Xml } from "./fixtures";

function parse(xml: string) {
  return parseDentalProject(parseXmlDocument(xml));
}

describe("reading a .dentalProject export", () => {
  it("reads the case, practice and patient details", () => {
    const project = parse(PROJECT_XML);

    expect(project).toMatchObject({
      createdAt: "2026-09-02T08:42:50",
      trayNumber: "173",
      toothColour: "A1",
      antagonistType: "DigitalImpressionScan",
      movementMarkerScan: false,
      productName: "[Version 3.0]",
      projectGuid: "65333a21-29b5-42e2-bbf7-de2e79ef7c26",
      practice: { id: "003", name: "Dr. Example" },
      patient: { id: "173", name: "Test Patient" },
    });
  });

  it("keeps a multi-line note, numbers and all, as one value", () => {
    expect(parse(PROJECT_XML).notes).toBe(
      "Please make an adjusted night guard.\nXML 11-005033-1-3190-KB-1564-1-4\nInsertion on Friday at 8:30",
    );
  });

  it("reads a tray number as text, not as a number", () => {
    expect(parse(PROJECT_XML).trayNumber).toBeTypeOf("string");
  });

  it("reports a missing field as unknown rather than failing", () => {
    const project = parse(
      '<?xml version="1.0"?><Treatment><TrayNo>7</TrayNo></Treatment>',
    );

    expect(project.trayNumber).toBe("7");
    expect(project.notes).toBeNull();
    expect(project.movementMarkerScan).toBeNull();
    expect(project.patient).toEqual({ id: null, name: null });
  });

  it("refuses a document that is not a treatment case", () => {
    const document = parseXmlDocument(
      matrix4Xml([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    );

    expect(() => parseDentalProject(document)).toThrow(
      UnexpectedRootElementError,
    );
  });
});
