import { del, get, set } from "idb-keyval";
import { isViewSettings } from "../domain/view-settings";
import {
  compactFiles,
  isStoredFiles,
  type SessionStore,
} from "./session-store";

const FILES_KEY = "jaws-viewer/last-bundle";
const VIEW_KEY = "jaws-viewer/last-view";

/**
 * Keeps the last session in IndexedDB.
 *
 * IndexedDB rather than localStorage because a bundle is tens of megabytes of mesh, and
 * localStorage holds only strings within a few megabytes — binary would have to be inflated
 * into base64 and would not fit.
 */
export function createIndexedDbSessionStore(): SessionStore {
  return {
    async saveFiles(files) {
      await set(FILES_KEY, compactFiles(files));
    },
    async readFiles() {
      const stored = await get<unknown>(FILES_KEY);
      return isStoredFiles(stored) ? stored : null;
    },
    async saveView(view) {
      await set(VIEW_KEY, view);
    },
    async readView() {
      const stored = await get<unknown>(VIEW_KEY);
      return isViewSettings(stored) ? stored : null;
    },
    async forget() {
      await del(FILES_KEY);
      await del(VIEW_KEY);
    },
  };
}
