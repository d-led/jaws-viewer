import type { ViewSettings } from "../src/domain/view-settings";
import type { BundleFile } from "../src/io/bundle-file";
import type { SessionStore } from "../src/io/session-store";

/**
 * Keeps a session in memory, so persistence can be described without a real database.
 *
 * The methods return settled promises rather than being `async`: the store is synchronous
 * underneath, and saying so keeps the shape of the port without pretending to be asynchronous.
 */
export class FakeSessionStore implements SessionStore {
  files: readonly BundleFile[] | null = null;
  view: ViewSettings | null = null;
  fileSaveFailure: string | null = null;
  readFailure: string | null = null;
  forgetCount = 0;

  saveFiles(files: readonly BundleFile[]): Promise<void> {
    if (this.fileSaveFailure !== null) {
      return Promise.reject(new Error(this.fileSaveFailure));
    }

    this.files = files;
    return Promise.resolve();
  }

  readFiles(): Promise<readonly BundleFile[] | null> {
    if (this.readFailure !== null) {
      return Promise.reject(new Error(this.readFailure));
    }

    return Promise.resolve(this.files);
  }

  saveView(view: ViewSettings): Promise<void> {
    this.view = view;
    return Promise.resolve();
  }

  readView(): Promise<ViewSettings | null> {
    if (this.readFailure !== null) {
      return Promise.reject(new Error(this.readFailure));
    }

    return Promise.resolve(this.view);
  }

  forget(): Promise<void> {
    this.forgetCount += 1;
    this.files = null;
    this.view = null;
    return Promise.resolve();
  }
}
