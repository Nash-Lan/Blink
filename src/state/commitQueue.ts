export class SerialTaskQueue {
  private tail: Promise<unknown> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task);
    this.tail = run.catch(() => undefined);
    return run;
  }
}

export type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
};

export function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export class StorageLoadBarrier {
  private readonly gate = createDeferred<void>();
  private failure: unknown = null;

  complete(): void {
    this.gate.resolve();
  }

  fail(error: unknown): void {
    this.failure = error;
    this.gate.resolve();
  }

  async wait(): Promise<void> {
    await this.gate.promise;
    if (this.failure) {
      throw new Error('Storage could not be loaded; changes were not saved. Restart Blink and restore a valid backup if the problem continues.');
    }
  }
}

type PersistedUpdate<T> = {
  getCurrent(): T;
  produce(current: T): T;
  save(next: T): Promise<void>;
  publish(next: T): void;
};

export async function persistThenPublish<T>({ getCurrent, produce, save, publish }: PersistedUpdate<T>): Promise<T> {
  const next = produce(getCurrent());
  await save(next);
  publish(next);
  return next;
}
