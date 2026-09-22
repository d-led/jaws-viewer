import "./styles/app.css";
import { createIndexedDbSessionStore } from "./io/indexeddb-session-store";
import { createApp } from "./ui/app";
import { createViewport } from "./viewer/three-viewport";

const root = document.querySelector<HTMLElement>("#app");
if (root === null) throw new Error("The page has no #app mount point.");

const app = createApp(root, {
  createViewport,
  store: createIndexedDbSessionStore(),
});

// Bring back whatever was open last time, without waiting to be asked.
void app.restore();
