import type { FromWorker, ToWorker } from "../src/viewer/curvature-protocol";
import type {
  StartThread,
  ThreadHandlers,
  WorkerThread,
} from "../src/viewer/surface-painter";

/**
 * A worker thread that does nothing by itself, so what the painter asks of it — and what it does
 * with the answers — can be described without a browser.
 */
export class FakeThread implements WorkerThread {
  readonly asked: ToWorker[] = [];
  readonly handedOver: Array<Transferable[] | undefined> = [];
  terminated = false;

  constructor(private readonly handlers: ThreadHandlers) {}

  postMessage(message: ToWorker, transfer?: Transferable[]): void {
    this.asked.push(message);
    this.handedOver.push(transfer);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Replies to what was asked, as a thread that is still alive would. */
  reply(message: FromWorker): void {
    if (this.terminated) return;
    this.handlers.received(message);
  }

  /** Gives up, as a thread does when it cannot be started or dies mid-request. */
  break(reason: string): void {
    this.handlers.broke(reason);
  }
}

/** Hands out a fresh thread per start, so a cancel can be told from a reuse. */
export class FakeThreads {
  readonly started: FakeThread[] = [];

  readonly start: StartThread = (handlers) => {
    const thread = new FakeThread(handlers);
    this.started.push(thread);
    return thread;
  };

  get current(): FakeThread {
    const thread = this.started.at(-1);
    if (thread === undefined) {
      throw new Error("No worker thread has been started.");
    }
    return thread;
  }
}
