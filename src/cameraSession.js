// 相機串流的所有權管理(純邏輯,不碰 DOM):任何時刻最多一條有效串流;
// start() 等待期間若被 stop() 或新的 start() 取代,晚到的串流會立刻被關掉。
export function createCameraSession({ getUserMedia }) {
  let current = null;
  let sessionId = 0;

  function stopStream(s) {
    if (s) s.getTracks().forEach((track) => track.stop());
  }

  function stop() {
    sessionId += 1;
    const s = current;
    current = null;
    stopStream(s);
  }

  async function start(constraints) {
    stop();
    const myId = sessionId;
    let s;
    try {
      s = await getUserMedia(constraints);
    } catch (err) {
      if (myId !== sessionId) return null;
      throw err;
    }
    if (myId !== sessionId) {
      stopStream(s);
      return null;
    }
    current = s;
    return s;
  }

  return { start, stop, isActive: () => current !== null, stream: () => current };
}
