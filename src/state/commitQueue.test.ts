import { describe, expect, it, vi } from 'vitest';
import { createDeferred, persistThenPublish, SerialTaskQueue, StorageLoadBarrier } from './commitQueue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('persisted commit queue', () => {
  it('waits for hydration before deriving the first persisted update', async () => {
    const queue = new SerialTaskQueue();
    const hydration = createDeferred<void>();
    const save = vi.fn(async () => undefined);
    let current = 0;
    const pending = queue.enqueue(async () => {
      await hydration.promise;
      return persistThenPublish({
        getCurrent: () => current,
        produce: (value) => value + 1,
        save,
        publish: (value) => { current = value; },
      });
    });

    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
    current = 10;
    hydration.resolve();

    await expect(pending).resolves.toBe(11);
    expect(save).toHaveBeenCalledWith(11);
  });

  it('blocks writes after storage loading fails so an unread snapshot is not overwritten', async () => {
    const barrier = new StorageLoadBarrier();
    const save = vi.fn(async () => undefined);
    barrier.fail(new Error('corrupt snapshot'));

    await expect((async () => {
      await barrier.wait();
      await save();
    })()).rejects.toThrow('changes were not saved');
    expect(save).not.toHaveBeenCalled();
  });

  it('blocks reconciliation after storage loading fails so device state is not cleared from defaults', async () => {
    const barrier = new StorageLoadBarrier();
    const reconcile = vi.fn(async () => undefined);
    barrier.fail(new Error('corrupt snapshot'));

    await expect((async () => {
      await barrier.wait();
      await reconcile();
    })()).rejects.toThrow('changes were not saved');
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('serializes rapid updates and derives each value from the last saved state', async () => {
    const queue = new SerialTaskQueue();
    const firstWrite = deferred();
    const saved: number[] = [];
    const published: number[] = [];
    let current = 0;
    const commit = (increment: number) => queue.enqueue(() => persistThenPublish({
      getCurrent: () => current,
      produce: (value) => value + increment,
      save: async (value) => {
        saved.push(value);
        if (value === 1) {
          await firstWrite.promise;
        }
      },
      publish: (value) => {
        current = value;
        published.push(value);
      },
    }));

    const first = commit(1);
    const second = commit(1);
    await vi.waitFor(() => expect(saved).toEqual([1]));
    expect(published).toEqual([]);
    firstWrite.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(saved).toEqual([1, 2]);
    expect(published).toEqual([1, 2]);
    expect(current).toBe(2);
  });

  it('does not publish a value when persistence fails', async () => {
    let current = 4;

    await expect(persistThenPublish({
      getCurrent: () => current,
      produce: (value) => value + 1,
      save: async () => { throw new Error('write failed'); },
      publish: (value) => { current = value; },
    })).rejects.toThrow('write failed');

    expect(current).toBe(4);
  });

  it('continues processing queued work after a failed write', async () => {
    const queue = new SerialTaskQueue();
    let current = 0;
    const failed = queue.enqueue(() => persistThenPublish({
      getCurrent: () => current,
      produce: (value) => value + 1,
      save: async () => { throw new Error('write failed'); },
      publish: (value) => { current = value; },
    }));
    const recovered = queue.enqueue(() => persistThenPublish({
      getCurrent: () => current,
      produce: (value) => value + 2,
      save: async () => undefined,
      publish: (value) => { current = value; },
    }));

    await expect(failed).rejects.toThrow('write failed');
    await expect(recovered).resolves.toBe(2);
    expect(current).toBe(2);
  });
});
