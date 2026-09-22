import type { DentalProject } from "../domain/dental-project";
import {
  booleanOf,
  childNode,
  requireRoot,
  textOf,
  type XmlDocument,
} from "./xml";

const ROOT_ELEMENT = "Treatment";

/** Reads the case metadata an exocad `Treatment` document carries. */
export function parseDentalProject(document: XmlDocument): DentalProject {
  requireRoot(document, ROOT_ELEMENT);
  const root = document.root;
  const practice = childNode(root, "Practice") ?? {};
  const patient = childNode(root, "Patient") ?? {};

  return {
    createdAt: textOf(root, "DateTime"),
    trayNumber: textOf(root, "TrayNo"),
    notes: textOf(root, "Notes"),
    projectGuid: textOf(root, "ProjectGUID"),
    toothColour: textOf(root, "ToothColor"),
    antagonistType: textOf(root, "AntagonistType"),
    movementMarkerScan: booleanOf(root, "MovementMarkerScan"),
    productName: textOf(root, "DentalDBProductName"),
    practice: {
      id: textOf(practice, "PracticeId"),
      name: textOf(practice, "PracticeName"),
    },
    patient: {
      id: textOf(patient, "PatientId"),
      name: textOf(patient, "PatientName"),
    },
  };
}
