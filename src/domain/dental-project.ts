/** Header information an exocad `.dentalProject` export carries. */
export interface Practice {
  readonly id: string | null;
  readonly name: string | null;
}

export interface Patient {
  readonly id: string | null;
  readonly name: string | null;
}

export interface DentalProject {
  /** ISO-8601 timestamp the case was created, verbatim from the export. */
  readonly createdAt: string | null;
  readonly trayNumber: string | null;
  /** Free-form instructions from the sending practice; may span several lines. */
  readonly notes: string | null;
  readonly projectGuid: string | null;
  readonly toothColour: string | null;
  readonly antagonistType: string | null;
  /** Whether the scan included movement-marker scans. */
  readonly movementMarkerScan: boolean | null;
  readonly productName: string | null;
  readonly practice: Practice;
  readonly patient: Patient;
}

export const UNKNOWN_PROJECT: DentalProject = {
  createdAt: null,
  trayNumber: null,
  notes: null,
  projectGuid: null,
  toothColour: null,
  antagonistType: null,
  movementMarkerScan: null,
  productName: null,
  practice: { id: null, name: null },
  patient: { id: null, name: null },
};
