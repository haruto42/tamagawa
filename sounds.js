// 音はすべて Web Audio で合成する(音声ファイルは使わない)。
// ブラウザの決まりで、最初の操作(クリック・タッチ・キー)のあとでないと鳴らない
const Sound = (() => {
  let ac = null;
  let master = null;
  let noiseBuf = null;
  let started = false;
  let muted = false;

  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ac.destination);
    }
    if (ac.state === "suspended") ac.resume();
  }

  // at を渡すと、その時刻(AudioContext の時計)に鳴らす
  function tone(freq, dur, { type = "square", vol = 0.12, delay = 0, to = null, at = null, dest = null } = {}) {
    if (!ac) return;
    const t = at ?? ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function getNoise() {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function noise(dur, { vol = 0.2, from = 2000, to = null, delay = 0, type = "lowpass" } = {}) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource();
    s.buffer = getNoise();
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  // BGM は音声ファイルをループ再生する。<audio> を使うのは、
  // ファイルを直接開いた(file://)場合でも読み込めるようにするため
  const BGM_VOLUME = 0.5;
  let bgm = null;

  // BGM と川のせせらぎを始める
  function start() {
    unlock();
    if (!ac || started) return;
    started = true;

    bgm = new Audio("BGM.mp3");
    bgm.loop = true;
    bgm.volume = BGM_VOLUME;
    bgm.muted = muted;
    bgm.play().catch(() => {});

    const river = ac.createBufferSource();
    river.buffer = getNoise();
    river.loop = true;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 500;
    const g = ac.createGain();
    g.gain.value = 0.05;
    river.connect(f).connect(g).connect(master);
    river.start();
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.6;
    if (bgm) bgm.muted = muted;
    return muted;
  }

  return {
    unlock, start, toggleMute,
    click: () => tone(520, 0.05, { vol: 0.08 }),
    pickup: () => { tone(660, 0.08, { vol: 0.1 }); tone(990, 0.12, { vol: 0.1, delay: 0.07 }); },
    step: () => noise(0.05, { vol: 0.05, from: 900 }),
    rustle: () => noise(0.6, { vol: 0.15, from: 3000, to: 800, type: "bandpass" }),
    land: () => tone(180, 0.07, { type: "triangle", vol: 0.12, to: 100 }),
    chop: (delay = 0) => {
      noise(0.08, { vol: 0.3, from: 1500, delay });
      tone(140, 0.12, { type: "triangle", vol: 0.25, to: 70, delay });
    },
    treeFall: () => {
      noise(0.5, { vol: 0.25, from: 1200, to: 200 });
      tone(90, 0.4, { type: "triangle", vol: 0.2, to: 50 });
    },
    door: () => {
      tone(220, 0.35, { type: "sawtooth", vol: 0.08, to: 140 });
      noise(0.3, { vol: 0.06, from: 600 });
    },
    pop: () => tone(300, 0.15, { type: "sine", vol: 0.2, to: 700 }),
    craft: () => {
      for (const d of [0, 0.14]) {
        noise(0.05, { vol: 0.25, from: 3000, delay: d });
        tone(800, 0.06, { vol: 0.1, delay: d });
      }
    },
    whoosh: (delay = 0) => noise(0.5, { vol: 0.18, from: 400, to: 3000, delay, type: "bandpass" }),
    thud: (delay = 0) => {
      tone(110, 0.15, { type: "triangle", vol: 0.25, to: 60, delay });
      noise(0.08, { vol: 0.15, from: 800, delay });
    },
    plank: () => {
      tone(200, 0.06, { vol: 0.15, to: 120 });
      noise(0.06, { vol: 0.2, from: 2500 });
    },
    success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: "triangle", vol: 0.15, delay: i * 0.1 })),
    splash: () => {
      noise(0.6, { vol: 0.3, from: 3500, to: 500 });
      tone(400, 0.2, { type: "sine", vol: 0.15, to: 150 });
    },
    bubble: () => tone(500 + Math.random() * 200, 0.1, { type: "sine", vol: 0.08, to: 900 }),
    gameover: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, { type: "sawtooth", vol: 0.1, delay: i * 0.25 })),
    fanfare: () => {
      [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.45]].forEach(([f, d]) => tone(f, 0.18, { type: "triangle", vol: 0.18, delay: d }));
      [[784, 0.8], [1047, 0.95]].forEach(([f, d]) => tone(f, 0.6, { type: "triangle", vol: 0.18, delay: d }));
    },
  };
})();
