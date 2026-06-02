/* ============================================================
   NEON ARCADE — sfx.js
   Tiny Web-Audio chiptune SFX library. No audio files.
   Usage:  SFX.score();  SFX.jump();  SFX.explode();  ...
   Auto-injects a floating 🔊 mute toggle (persisted in localStorage).
   ============================================================ */
const SFX = (function () {
  let ctx = null, master = null;
  let muted = localStorage.getItem('neonSfxMuted') === '1';

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);
  }
  const t = () => ctx.currentTime;
  function ready() { if (muted) return false; init(); if (!ctx) return false; if (ctx.state === 'suspended') ctx.resume(); return true; }

  // single tone with attack/decay envelope and optional pitch glide
  function blip(freq = 440, dur = 0.12, type = 'square', vol = 1, glide = null) {
    if (!ready()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t());
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(1, glide), t() + dur);
    g.gain.setValueAtTime(0.0001, t());
    g.gain.exponentialRampToValueAtTime(vol, t() + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t() + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(t() + dur + 0.02);
  }
  // filtered noise burst (explosions, thuds, hats)
  function noise(dur = 0.2, vol = 0.7, freq = 1000, type = 'lowpass') {
    if (!ready()) return;
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t());
    g.gain.exponentialRampToValueAtTime(0.0001, t() + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(); src.stop(t() + dur);
  }
  // play a short melody: array of {f, d, type, vol}
  function seq(notes) {
    let acc = 0;
    notes.forEach(n => { setTimeout(() => blip(n.f, n.d || 0.12, n.type || 'square', n.vol || 0.9, n.glide || null), acc * 1000); acc += n.d || 0.12; });
  }
  const TONES = [415.30, 329.63, 277.18, 207.65]; // Simon pads (low/varied)

  // ---- ambient background hum (synthwave pad drone; used by the hub) ----
  let hum = null, humDesired = false;
  function buildHum() {
    if (hum || muted) return;
    init(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(ctx.destination);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 7;
    lp.connect(out);
    // root + fifth + octave pad, gently detuned
    const voices = [[55, 'sine', -7], [82.41, 'sine', 5], [110, 'triangle', -4], [164.81, 'sine', 8]];
    const oscs = voices.map(([f, type, det]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      const vg = ctx.createGain(); vg.gain.value = f > 120 ? 0.35 : 0.7;
      o.connect(vg); vg.connect(lp); return o;
    });
    // slow filter sweep + slow tremolo for movement
    const fl = ctx.createOscillator(); fl.frequency.value = 0.05; const flg = ctx.createGain(); flg.gain.value = 160;
    fl.connect(flg); flg.connect(lp.frequency);
    const tr = ctx.createOscillator(); tr.frequency.value = 0.11; const trg = ctx.createGain(); trg.gain.value = 0.018;
    tr.connect(trg); trg.connect(out.gain);
    oscs.forEach(o => o.start()); fl.start(); tr.start();
    out.gain.setValueAtTime(0.0001, t());
    out.gain.exponentialRampToValueAtTime(0.06, t() + 3.0); // slow fade-in
    hum = { out, nodes: [...oscs, fl, tr] };
  }
  function teardownHum() {
    if (!hum || !ctx) return;
    const h = hum; hum = null;
    try {
      h.out.gain.cancelScheduledValues(t());
      h.out.gain.setTargetAtTime(0.0001, t(), 0.5);
    } catch (e) {}
    setTimeout(() => { try { h.nodes.forEach(n => n.stop()); } catch (e) {} }, 1400);
  }
  function applyHum() { if (humDesired && !muted) buildHum(); else teardownHum(); }

  const api = {
    get muted() { return muted; },
    toggle() { muted = !muted; localStorage.setItem('neonSfxMuted', muted ? '1' : '0'); applyHum(); return muted; },
    startHum() { humDesired = true; applyHum(); },
    stopHum() { humDesired = false; teardownHum(); },
    // generic
    blip, noise,
    // UI
    move()    { blip(200, 0.045, 'square', 0.45); },
    select()  { blip(660, 0.07, 'square', 0.55); },
    flip()    { blip(520, 0.08, 'triangle', 0.6, 760); },
    tick()    { blip(840, 0.03, 'square', 0.35); },
    // pickups / progress
    score()   { blip(880, 0.10, 'square', 0.6, 1240); },
    coin()    { blip(988, 0.06, 'square', 0.55); setTimeout(() => blip(1319, 0.12, 'square', 0.55), 65); },
    match()   { blip(740, 0.09, 'square', 0.55); setTimeout(() => blip(1109, 0.13, 'square', 0.55), 80); },
    // action
    jump()    { blip(300, 0.13, 'square', 0.55, 720); },
    shoot()   { blip(880, 0.12, 'sawtooth', 0.45, 180); },
    laser()   { blip(1200, 0.16, 'sawtooth', 0.45, 200); },
    bounce()  { blip(440, 0.05, 'square', 0.5, 680); },
    hit()     { blip(180, 0.08, 'square', 0.55, 90); },
    place()   { blip(150, 0.10, 'square', 0.5, 100); },
    rotate()  { blip(440, 0.05, 'square', 0.4, 560); },
    bonk()    { noise(0.10, 0.6, 900); blip(150, 0.10, 'square', 0.5, 70); },
    tone(i)   { blip(TONES[((i % 4) + 4) % 4], 0.30, 'sine', 0.8); },
    // outcomes
    explode() { noise(0.45, 0.9, 700, 'lowpass'); blip(120, 0.4, 'sawtooth', 0.4, 38); },
    powerup() { seq([{ f: 523 }, { f: 659 }, { f: 784 }, { f: 1046, d: 0.22 }]); },
    win()     { seq([{ f: 523, d: 0.12 }, { f: 659, d: 0.12 }, { f: 784, d: 0.12 }, { f: 1046, d: 0.24 }]); },
    lose()    { seq([{ f: 392, d: 0.16, type: 'sawtooth' }, { f: 311, d: 0.16, type: 'sawtooth' }, { f: 233, d: 0.32, type: 'sawtooth' }]); },
    gameover(){ seq([{ f: 440, d: 0.14, type: 'square' }, { f: 349, d: 0.14, type: 'square' }, { f: 261, d: 0.16, type: 'square' }, { f: 196, d: 0.4, type: 'sawtooth' }]); },
  };
  return api;
})();

/* floating mute toggle, injected on every page that loads sfx.js */
(function () {
  if (typeof document === 'undefined') return;
  function add() {
    if (document.getElementById('sfx-toggle')) return;
    const b = document.createElement('button');
    b.id = 'sfx-toggle';
    b.type = 'button';
    b.setAttribute('aria-label', 'Toggle sound');
    const paint = () => { b.textContent = SFX.muted ? '🔇' : '🔊'; };
    paint();
    b.addEventListener('click', () => { const m = SFX.toggle(); paint(); if (!m) SFX.select(); });
    Object.assign(b.style, {
      position: 'fixed', right: '14px', bottom: '12px', zIndex: 300,
      background: 'rgba(10,4,24,.72)', border: '2px solid var(--neon-cyan,#25f4ee)',
      color: '#fff', borderRadius: '8px', cursor: 'pointer', fontSize: '18px',
      padding: '5px 9px', lineHeight: '1', boxShadow: '0 0 10px rgba(37,244,238,.45)'
    });
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
})();
