import { describe, it, expect } from 'vitest';
import { createCameraSession } from '../src/cameraSession.js';

function fakeStream() {
  const tracks = [{ stopped: 0, stop() { this.stopped++; } }, { stopped: 0, stop() { this.stopped++; } }];
  return { tracks, getTracks: () => tracks };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const allStopped = (s) => s.tracks.every((t) => t.stopped >= 1);

describe('createCameraSession', () => {
  it('(a) stop() during a pending start stops the late stream and resolves null', async () => {
    const d = deferred();
    const session = createCameraSession({ getUserMedia: () => d.promise });
    const p = session.start({});
    session.stop();
    const late = fakeStream();
    d.resolve(late);
    expect(await p).toBeNull();
    expect(allStopped(late)).toBe(true);
    expect(session.isActive()).toBe(false);
  });

  it('(b) two concurrent starts leave exactly one active stream', async () => {
    const d1 = deferred(), d2 = deferred();
    const queue = [d1, d2];
    const session = createCameraSession({ getUserMedia: () => queue.shift().promise });
    const p1 = session.start({});
    const p2 = session.start({});
    const s1 = fakeStream(), s2 = fakeStream();
    d1.resolve(s1);
    d2.resolve(s2);
    expect(await p1).toBeNull();
    expect(await p2).toBe(s2);
    expect(allStopped(s1)).toBe(true);
    expect(s2.tracks.every((t) => t.stopped === 0)).toBe(true);
    expect(session.isActive()).toBe(true);
    expect(session.stream()).toBe(s2);
  });

  it('(c) stop() stops all tracks of an active stream and is idempotent', async () => {
    const s = fakeStream();
    const session = createCameraSession({ getUserMedia: async () => s });
    await session.start({});
    expect(session.isActive()).toBe(true);
    session.stop();
    session.stop();
    expect(s.tracks.map((t) => t.stopped)).toEqual([1, 1]);
    expect(session.isActive()).toBe(false);
    expect(session.stream()).toBeNull();
  });

  it('(d) start after stop works', async () => {
    const s = fakeStream();
    const session = createCameraSession({ getUserMedia: async () => s });
    session.stop();
    expect(await session.start({})).toBe(s);
    expect(session.isActive()).toBe(true);
  });

  it('start while active stops the previous stream', async () => {
    const streams = [fakeStream(), fakeStream()];
    const session = createCameraSession({ getUserMedia: async () => streams.shift() });
    const first = await session.start({});
    const second = await session.start({});
    expect(allStopped(first)).toBe(true);
    expect(session.stream()).toBe(second);
  });

  it('(e) rejection propagates when not superseded', async () => {
    const err = new Error('denied');
    const session = createCameraSession({ getUserMedia: async () => { throw err; } });
    await expect(session.start({})).rejects.toBe(err);
    expect(session.isActive()).toBe(false);
  });

  it('(f) superseded rejection is swallowed', async () => {
    const d = deferred();
    const session = createCameraSession({ getUserMedia: () => d.promise });
    const p = session.start({});
    session.stop();
    d.reject(new Error('late'));
    expect(await p).toBeNull();
  });
});
