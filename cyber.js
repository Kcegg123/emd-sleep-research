(() => {
    'use strict';

    const FS = 128;
    const IMF_DARK = ['#ff4fd8', '#a78bfa', '#22d3ee', '#a3e635', '#fbbf24', '#fb7185'];
    const IMF_LIGHT = ['#db2777', '#6d28d9', '#0e7490', '#4d7c0f', '#b45309', '#e11d48'];
    let IMF = IMF_DARK;
    let CYAN = '#33e1ff';
    const TH = { dark: true, glow: 1 };
    const ink = a => TH.dark ? `rgba(255,255,255,${a})` : `rgba(12,18,32,${a})`;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const ease = t => 1 - Math.pow(1 - t, 3);
    const $ = s => document.querySelector(s);
    const $$ = s => [...document.querySelectorAll(s)];

    // ---------- canvas helpers ----------
    function setupCanvas(canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const r = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, w, h };
    }
    function polyline(ctx, pts, color, width = 1.5, glow = 0, alpha = 1) {
        if (pts.length < 2) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow * TH.glow; }
        ctx.stroke();
        ctx.restore();
    }
    function mapPts(data, x0, x1, yc, scale, from = 0, to = data.length) {
        const n = data.length, out = [];
        for (let i = from; i < to; i++) out.push([x0 + (x1 - x0) * i / (n - 1), yc - data[i] * scale]);
        return out;
    }
    function maxAbs(a) { let m = 0; for (const v of a) if (Math.abs(v) > m) m = Math.abs(v); return m || 1; }
    function label(ctx, text, x, y, color, size = 11, align = 'left') {
        ctx.save(); ctx.font = `${size}px "JetBrains Mono", monospace`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); ctx.restore();
    }
    const vis = {};
    function watch(el, key) {
        if (!el) return;
        new IntersectionObserver(([e]) => { vis[key] = e.isIntersecting; }, { threshold: 0.01 }).observe(el);
    }

    // ---------- cursor ----------
    const cursor = $('.cursor');
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    $$('[data-magnetic]').forEach(el => {
        el.addEventListener('pointerenter', () => cursor.classList.add('hot'));
        el.addEventListener('pointerleave', () => cursor.classList.remove('hot'));
    });
    function cursorTick() {
        cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22;
        cursor.style.transform = `translate(${cx}px, ${cy}px)`;
    }

    // ---------- hero ----------
    const heroCanvas = $('#hero-canvas');
    let heroReveal = reduced ? 1 : 0;
    const heroLayers = [
        { p: DSP.STAGES[3], hue: 160, y: 0.66, sc: 0.045, op: 0.32, speed: 0.6, tau: 3 },
        { p: DSP.STAGES[2], hue: 268, y: 0.58, sc: 0.055, op: 0.32, speed: 0.85, tau: 11 },
        { p: DSP.STAGES[0], hue: 38, y: 0.42, sc: 0.04, op: 0.28, speed: 1.1, tau: 27 },
    ];
    function drawHero(now) {
        const { ctx, w, h } = setupCanvas(heroCanvas);
        ctx.clearRect(0, 0, w, h);
        const n = Math.min(640, Math.floor(w / 2.2));
        const win = 7;
        const comp = new Array(n).fill(0);
        const upto = Math.max(2, Math.floor(n * heroReveal));
        heroLayers.forEach(L => {
            const tau0 = L.tau + now * 0.001 * L.speed;
            const data = new Array(n);
            for (let i = 0; i < n; i++) {
                const tau = tau0 + i / n * win;
                const b = DSP.bands(tau, L.p);
                data[i] = b.delta + b.theta + b.alpha + b.sigma + b.beta + b.kc + b.saw;
                comp[i] += data[i] * 0.45;
            }
            polyline(ctx, mapPts(data, 0, w, h * L.y, h * L.sc, 0, upto), `hsl(${L.hue} 90% ${TH.dark ? 62 : 45}%)`, 1.2, 14, L.op);
        });
        const pts = mapPts(comp, 0, w, h * 0.5, h * 0.07, 0, upto);
        polyline(ctx, pts, CYAN, 1.8, 22, 0.85);
        polyline(ctx, pts, ink(1), 0.6, 0, 0.5);
        if (heroReveal < 1 && pts.length) {
            const [hx, hy] = pts[pts.length - 1];
            ctx.save(); ctx.fillStyle = ink(1); ctx.shadowColor = CYAN; ctx.shadowBlur = 30; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
    }

    // ---------- journey ----------
    const journeySec = $('#journey');
    const journeyCanvas = $('#journey-canvas');
    const hypnoCanvas = $('#hypno-canvas');
    const stageBadge = $('#stage-badge');
    const journey = { progress: 0, hue: 38 };
    const HYPNO_LEVEL = [0, 1, 2, 3, 0.7];
    function journeyProgress() {
        const r = journeySec.getBoundingClientRect();
        return clamp(-r.top / (r.height - innerHeight), 0, 1);
    }
    function drawJourney(now) {
        const { ctx, w, h } = setupCanvas(journeyCanvas);
        ctx.clearRect(0, 0, w, h);
        const p = DSP.stageParams(journey.progress);
        const hue = p.hue;
        journey.hue = hue;
        const tau0 = now * 0.001 * 0.9 + journey.progress * 60;
        const win = 6, n = Math.min(720, Math.floor(w / 1.6));
        const comp = new Array(n), d = new Array(n), t = new Array(n), a = new Array(n), b = new Array(n);
        for (let i = 0; i < n; i++) {
            const tau = tau0 + i / n * win;
            const bb = DSP.bands(tau, p);
            d[i] = bb.delta + bb.kc * 0.6; t[i] = bb.theta; a[i] = bb.alpha + bb.sigma; b[i] = bb.beta + bb.saw;
            comp[i] = d[i] + t[i] + a[i] + b[i] + p.noise * DSP.noiseAt(Math.round(tau * FS));
        }
        const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.6);
        g.addColorStop(0, `hsla(${hue} 90% 60% / 0.12)`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

        const yc = h * 0.40, sc = h * 0.07;
        ctx.save(); ctx.strokeStyle = ink(0.06); ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke(); ctx.restore();
        const pts = mapPts(comp, 0, w, yc, sc);
        polyline(ctx, pts, `hsl(${hue} 95% ${TH.dark ? 62 : 42}%)`, 2, 24, 0.95);
        polyline(ctx, pts, ink(1), 0.7, 0, 0.55);
        label(ctx, `EEG · C3-A2 · ${p.name}`, 24, yc - h * 0.09, `hsla(${hue} 90% ${TH.dark ? 70 : 36}% / 0.9)`, 11);

        const rows = [
            ['δ  0.5–4 Hz', d, IMF[4]], ['θ  4–8 Hz', t, IMF[3]], ['α/σ 8–14 Hz', a, IMF[2]], ['β  13–30 Hz', b, IMF[1]]
        ];
        rows.forEach(([name, data, color], k) => {
            const ry = h * (0.60 + k * 0.065), rs = h * 0.018;
            ctx.save(); ctx.strokeStyle = ink(0.05); ctx.beginPath(); ctx.moveTo(110, ry); ctx.lineTo(w - 24, ry); ctx.stroke(); ctx.restore();
            polyline(ctx, mapPts(data, 110, w - 24, ry, rs), color, 1.1, 8, 0.8);
            label(ctx, name, 24, ry, color, 10);
        });
    }
    function drawHypno() {
        const { ctx, w, h } = setupCanvas(hypnoCanvas);
        ctx.clearRect(0, 0, w, h);
        const pad = 8, x0 = 36, top = 10, bot = h - 10;
        const yOf = lvl => top + (bot - top) * lvl / 3;
        const pathPts = [];
        for (let i = 0; i <= 200; i++) {
            const pp = i / 200;
            const sp = DSP.stageParams(pp);
            const lvl = DSP.lerp(HYPNO_LEVEL[sp.seg], HYPNO_LEVEL[sp.seg + 1], sp.blend);
            pathPts.push([x0 + (w - x0 - pad) * pp, yOf(lvl)]);
        }
        ['W', 'N1', 'N2', 'N3'].forEach((s, i) => {
            ctx.save(); ctx.strokeStyle = ink(0.05); ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.moveTo(x0, yOf(i)); ctx.lineTo(w - pad, yOf(i)); ctx.stroke(); ctx.restore();
            label(ctx, s, pad, yOf(i), ink(0.35), 9);
        });
        polyline(ctx, pathPts, ink(0.18), 1.2);
        const k = Math.floor(journey.progress * 200);
        polyline(ctx, pathPts.slice(0, k + 1), `hsl(${journey.hue} 95% ${TH.dark ? 62 : 42}%)`, 2, 14);
        const [mx, my] = pathPts[k];
        ctx.save(); ctx.fillStyle = ink(1); ctx.shadowColor = `hsl(${journey.hue} 95% ${TH.dark ? 62 : 42}%)`; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    function updateJourneyUI() {
        const p = journey.progress;
        const sp = DSP.stageParams(p);
        document.documentElement.style.setProperty('--stage-hue', sp.hue.toFixed(1));
        const st = DSP.STAGES[Math.round(p * (DSP.STAGES.length - 1))];
        stageBadge.querySelector('.stage-badge-text').textContent = `${st.en} · ${st.name}`;
        const mins = 23 * 60 + p * 8 * 60;
        const hh = Math.floor(mins / 60) % 24, mm = Math.floor(mins % 60);
        $('#journey-clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    new IntersectionObserver(([e]) => stageBadge.classList.toggle('on', e.isIntersecting), { threshold: 0.05 }).observe(journeySec);

    // ---------- duel (FFT vs HHT) ----------
    const duel = { N: 512, x: null, spec: null, ifs: [], t: 0 };
    function initDuel() {
        const N = duel.N, x = new Array(N);
        for (let i = 0; i < N; i++) {
            const tt = i / FS;
            x[i] = Math.sin(2 * Math.PI * (3 * tt + 2.625 * tt * tt)) + 0.6 * Math.sin(2 * Math.PI * 1.2 * tt);
        }
        duel.x = x;
        duel.spec = DSP.spectrum(x, FS);
        const { imfs } = EMD.decompose(x, 3, 12);
        duel.ifs = imfs.map(imf => DSP.instFreq(imf, FS, 13));
    }
    function drawChirp() {
        const c = $('#chirp-canvas'); const { ctx, w, h } = setupCanvas(c);
        ctx.clearRect(0, 0, w, h);
        const yc = h * 0.55, sc = h * 0.28;
        ctx.save(); ctx.strokeStyle = ink(0.06); ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke(); ctx.restore();
        polyline(ctx, mapPts(duel.x, 0, w, yc, sc), CYAN, 1.4, 12, 0.9);
        const px = duel.t / 4 * w;
        ctx.save(); ctx.strokeStyle = ink(0.7); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, 8); ctx.lineTo(px, h - 8); ctx.stroke(); ctx.restore();
        label(ctx, `t = ${duel.t.toFixed(2)} s`, px + 6, 16, ink(0.7), 10);
    }
    function drawFFT() {
        const c = $('#fft-canvas'); const { ctx, w, h } = setupCanvas(c);
        ctx.clearRect(0, 0, w, h);
        const L = 40, R = w - 12, T = 16, B = h - 28;
        const FMAX = 32;
        const { mag, freq } = duel.spec;
        let mx = 0; for (let k = 0; k < mag.length && freq[k] <= FMAX; k++) mx = Math.max(mx, mag[k]);
        const pts = [];
        for (let k = 0; k < mag.length && freq[k] <= FMAX; k++) pts.push([L + (R - L) * freq[k] / FMAX, B - (B - T) * mag[k] / mx]);
        ctx.save();
        const g = ctx.createLinearGradient(0, T, 0, B); g.addColorStop(0, 'rgba(51,225,255,0.35)'); g.addColorStop(1, 'rgba(51,225,255,0)');
        ctx.beginPath(); ctx.moveTo(L, B); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[pts.length - 1][0], B); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.restore();
        polyline(ctx, pts, CYAN, 1.6, 14);
        for (let f = 0; f <= FMAX; f += 8) {
            const x = L + (R - L) * f / FMAX;
            ctx.save(); ctx.strokeStyle = ink(0.06); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke(); ctx.restore();
            label(ctx, f === FMAX ? `${f} Hz` : `${f}`, x, B + 12, ink(0.4), 10, f === FMAX ? 'right' : 'center');
        }
        label(ctx, '|X(f)|', L - 6, T + 4, ink(0.4), 10, 'right');
        label(ctx, '3 → 24 Hz 全部糊成一片', L + (R - L) * 0.42, T + 26, ink(0.55), 10, 'center');
        label(ctx, '1.2 Hz delta', L + (R - L) * 1.2 / FMAX + 6, T + 8, ink(0.55), 10, 'left');
    }
    function drawHHT() {
        const c = $('#hht-canvas'); const { ctx, w, h } = setupCanvas(c);
        ctx.clearRect(0, 0, w, h);
        const L = 40, R = w - 12, T = 16, B = h - 28;
        const FMAX = 32, N = duel.N;
        for (let f = 0; f <= FMAX; f += 8) {
            const y = B - (B - T) * f / FMAX;
            ctx.save(); ctx.strokeStyle = ink(0.06); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); ctx.restore();
            label(ctx, `${f}`, L - 6, y, ink(0.4), 10, 'right');
        }
        label(ctx, 'Hz', L + 4, T + 2, ink(0.4), 10, 'left');
        for (let s = 0; s <= 4; s++) label(ctx, `${s}s`, L + (R - L) * s / 4, B + 12, ink(0.4), 10, 'center');
        let gmax = 0; duel.ifs.forEach(({ amp }) => amp.forEach(v => { if (v > gmax) gmax = v; }));
        duel.ifs.forEach(({ freq, amp }, k) => {
            const color = IMF[k];
            let seg = [];
            const flush = () => { if (seg.length > 2) polyline(ctx, seg, color, 2.2, 14, 0.95); seg = []; };
            for (let i = 6; i < N - 6; i++) {
                if (amp[i] < 0.18 * gmax || freq[i] > FMAX) { flush(); continue; }
                seg.push([L + (R - L) * i / (N - 1), B - (B - T) * freq[i] / FMAX]);
            }
            flush();
        });
        label(ctx, 'IMF1 · chirp', R - 8, T + 10, IMF[0], 10, 'right');
        label(ctx, 'IMF2 · delta 1.2 Hz', R - 8, B - (B - T) * 1.2 / FMAX - 12, IMF[1], 10, 'right');
        const i = clamp(Math.round(duel.t / 4 * (N - 1)), 0, N - 1);
        const px = L + (R - L) * i / (N - 1);
        ctx.save(); ctx.strokeStyle = ink(0.7); ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, B); ctx.stroke(); ctx.restore();
        if (duel.ifs[0]) {
            const f = duel.ifs[0].freq[i];
            if (f <= FMAX) {
                const py = B - (B - T) * f / FMAX;
                ctx.save(); ctx.fillStyle = ink(1); ctx.shadowColor = IMF[0]; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                label(ctx, `${f.toFixed(1)} Hz`, px + 8, py - 10, ink(1), 11);
            }
        }
    }
    function drawDuel(now) {
        duel.t = ((now * 0.001) % 5.2) / 5.2 * 4.4;
        duel.t = Math.min(duel.t, 4);
        drawChirp(); drawHHT();
        if (!duel.fftDrawn || duel.fftW !== $('#fft-canvas').clientWidth) { drawFFT(); duel.fftDrawn = true; duel.fftW = $('#fft-canvas').clientWidth; }
    }

    // ---------- sifting cinematic ----------
    const siftCanvas = $('#sift-canvas');
    const PH_DUR = { 1: 1100, 2: 900, 3: 900, 4: 700, 5: 1200, 6: 1000 };
    const sift = { orig: null, residual: null, cur: null, next: null, phase: 0, t: 0, iter: 1, imfN: 0, playing: false, stepping: false, maxima: [], minima: [], up: [], lo: [], mean: [] };
    function siftReset() {
        const p = { ...DSP.STAGES[2], noise: 0.06, sigma: 0.9, delta: 0.9 };
        sift.orig = DSP.synth(360, FS, p, 5.2);
        sift.residual = [...sift.orig];
        sift.cur = [...sift.orig];
        sift.phase = 0; sift.t = 0; sift.iter = 1; sift.imfN = 0; sift.playing = false; sift.stepping = false;
        siftUI('待命 — 按「播放篩選」');
        $$('#sift-steps li').forEach(li => li.classList.remove('on', 'done'));
    }
    function siftPrepare() {
        sift.maxima = EMD.findLocalMaxima(sift.cur);
        sift.minima = EMD.findLocalMinima(sift.cur);
        sift.up = EMD.computeEnvelope(sift.cur, sift.maxima);
        sift.lo = EMD.computeEnvelope(sift.cur, sift.minima);
        sift.mean = sift.up.map((v, i) => (v + sift.lo[i]) / 2);
        sift.next = sift.cur.map((v, i) => v - sift.mean[i]);
    }
    function imfCondition(h) {
        const ex = EMD.findLocalMaxima(h).length + EMD.findLocalMinima(h).length;
        let zc = 0; for (let i = 1; i < h.length; i++) if (h[i] * h[i - 1] < 0) zc++;
        return Math.abs(ex - zc) <= 1;
    }
    function siftUI(text) { $('#sift-status').textContent = text; }
    function siftStepsUI() {
        $$('#sift-steps li').forEach(li => {
            const ph = +li.dataset.phase;
            li.classList.toggle('on', ph === sift.phase);
            li.classList.toggle('done', ph < sift.phase);
        });
    }
    function siftStart() {
        if (sift.phase === 0) {
            if (sift.imfN >= 4) siftReset();
            siftPrepare(); sift.phase = 1; sift.t = 0;
            siftUI(`IMF${sift.imfN + 1} · 迭代 ${sift.iter} · 辨識極值`);
            siftStepsUI();
        }
    }
    function siftAdvance(dt) {
        if (!sift.playing || sift.phase === 0) return;
        sift.t += dt / PH_DUR[sift.phase];
        if (sift.t < 1) return;
        sift.t = 0;
        if (sift.phase === 5) {
            sift.cur = sift.next;
            const ok = (sift.iter >= 2 && imfCondition(sift.cur)) || sift.iter >= 6;
            if (ok) { sift.phase = 6; siftUI(`IMF${sift.imfN + 1} 滿足條件 ✓ 提取中`); }
            else { sift.iter++; siftPrepare(); sift.phase = 1; siftUI(`IMF${sift.imfN + 1} · 迭代 ${sift.iter} · 均值仍不為零，再篩一次`); }
        } else if (sift.phase === 6) {
            sift.residual = sift.residual.map((v, i) => v - sift.cur[i]);
            sift.imfN++; sift.iter = 1;
            sift.cur = [...sift.residual];
            if (sift.imfN >= 4 || !sift.playing || sift.stepping) {
                sift.phase = 0; sift.playing = false;
                siftUI(`已提取 IMF1–IMF${sift.imfN}${sift.imfN >= 4 ? ' · 完成，按重來' : ' · 繼續 → 下一個 IMF'}`);
            } else { siftPrepare(); sift.phase = 1; siftUI(`IMF${sift.imfN + 1} · 迭代 1 · 對殘餘量重新篩選`); }
        } else {
            sift.phase++;
            const names = { 2: '上包絡（極大值樣條）', 3: '下包絡（極小值樣條）', 4: '均值 m(t)', 5: 'h(t) = x(t) − m(t)' };
            siftUI(`IMF${sift.imfN + 1} · 迭代 ${sift.iter} · ${names[sift.phase]}`);
        }
        siftStepsUI();
        if (sift.stepping) { sift.stepping = false; sift.playing = false; }
    }
    function drawSift() {
        const { ctx, w, h } = setupCanvas(siftCanvas);
        ctx.clearRect(0, 0, w, h);
        const L = 20, R = w - 20, yc = h * 0.5, sc = h * 0.34 / maxAbs(sift.orig);
        const { phase, t } = sift;
        const e = ease(clamp(t, 0, 1));
        ctx.save(); ctx.strokeStyle = ink(0.07); ctx.beginPath(); ctx.moveTo(L, yc); ctx.lineTo(R, yc); ctx.stroke(); ctx.restore();
        if (sift.imfN > 0 || sift.iter > 1) polyline(ctx, mapPts(sift.orig, L, R, yc, sc), ink(1), 1, 0, 0.08);

        let sig = sift.cur;
        if (phase === 5) sig = sift.cur.map((v, i) => v * (1 - e) + sift.next[i] * e);
        const sigColor = phase === 6 ? IMF[sift.imfN % IMF.length] : CYAN;
        polyline(ctx, mapPts(sig, L, R, yc, sc), sigColor, 1.8, phase === 6 ? 30 * (0.5 + 0.5 * Math.sin(t * Math.PI)) : 16, 0.95);

        const envAlpha = phase === 5 ? 1 - e : 1;
        if (phase >= 1 && phase <= 5) {
            const n = sift.cur.length;
            const xOf = i => L + (R - L) * i / (n - 1);
            const dots = (idx, color) => idx.forEach((i, k) => {
                let s = 1;
                if (phase === 1) { const tk = clamp((t - k / idx.length * 0.8) / 0.25, 0, 1); s = tk === 0 ? 0 : 1 + 0.6 * Math.sin(tk * Math.PI); if (tk === 0) return; }
                ctx.save(); ctx.globalAlpha = envAlpha; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.arc(xOf(i), yc - sift.cur[i] * sc, 3.2 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            });
            dots(sift.maxima, '#4ade80'); dots(sift.minima, '#f87171');
            const partial = (data, prog) => mapPts(data, L, R, yc, sc, 0, Math.max(2, Math.floor(n * prog)));
            if (phase >= 2) { ctx.setLineDash([6, 5]); polyline(ctx, partial(sift.up, phase === 2 ? e : 1), '#4ade80', 1.3, 8, 0.9 * envAlpha); ctx.setLineDash([]); }
            if (phase >= 3) { ctx.setLineDash([6, 5]); polyline(ctx, partial(sift.lo, phase === 3 ? e : 1), '#f87171', 1.3, 8, 0.9 * envAlpha); ctx.setLineDash([]); }
            if (phase >= 4) {
                const m = phase === 5 ? sift.mean.map(v => v * (1 - e)) : sift.mean;
                polyline(ctx, partial(m, phase === 4 ? e : 1), '#fbbf24', 2, 14, envAlpha * 0.6 + 0.4);
                label(ctx, phase === 5 ? 'm(t) → 0' : 'm(t)', R - 8, yc - m[m.length - 1] * sc - 12, '#fbbf24', 11, 'right');
            }
        }
        if (phase === 6) {
            ctx.save(); ctx.globalAlpha = 0.9; ctx.font = '700 22px "Space Grotesk", sans-serif'; ctx.fillStyle = sigColor; ctx.textAlign = 'center'; ctx.shadowColor = sigColor; ctx.shadowBlur = 24;
            ctx.fillText(`IMF ${sift.imfN + 1} 提取完成`, w / 2, 34); ctx.restore();
        }
        label(ctx, `x(t)  ·  N=${sift.orig.length}  ·  fs=${FS} Hz`, L + 4, h - 12, ink(0.35), 10);
        if (sift.imfN > 0) label(ctx, `已提取 ${sift.imfN} 個 IMF · 目前處理殘餘量`, R - 4, h - 12, ink(0.35), 10, 'right');
    }
    $('#sift-play').addEventListener('click', () => { if (sift.phase === 0) siftStart(); sift.playing = true; sift.stepping = false; });
    $('#sift-step').addEventListener('click', () => { if (sift.phase === 0) siftStart(); sift.playing = true; sift.stepping = true; });
    $('#sift-reset').addEventListener('click', siftReset);

    // ---------- lab ----------
    const labCanvas = $('#lab-canvas');
    const labTip = $('#lab-tooltip');
    const lab = { N: 768, x: null, imfs: [], residue: null, rows: [], muted: new Set(), hover: -1, dirty: true, stale: false, kc: 1, saw: 0, playing: false, playStart: 0, audio: null, nodes: [] };
    const sliders = { delta: $('#s-delta'), theta: $('#s-theta'), alpha: $('#s-alpha'), sigma: $('#s-sigma'), beta: $('#s-beta'), noise: $('#s-noise') };
    function labParams() {
        const p = {};
        for (const k in sliders) p[k] = +sliders[k].value;
        p.kc = lab.kc; p.saw = lab.saw; p.hue = 0;
        return p;
    }
    function labSyncOutputs() { for (const k in sliders) sliders[k].nextElementSibling.value = (+sliders[k].value).toFixed(2); }
    function labGenerate() { lab.x = DSP.synth(lab.N, FS, labParams(), 2.0); lab.dirty = true; }
    function labRows() {
        const { h } = setupCanvas(labCanvas);
        const count = 2 + lab.imfs.length;
        const rowH = (h - 20) / count;
        return { rowH, yOf: k => 10 + rowH * (k + 0.5) };
    }
    function labRun() {
        labGenerate();
        const { imfs, residue } = EMD.decompose(lab.x, 6, 10);
        lab.imfs = imfs; lab.residue = residue; lab.stale = false;
        const { yOf } = labRows();
        lab.rows = imfs.map((imf, k) => ({ y: yOf(0), alpha: 0 }));
        lab.resRow = { y: yOf(0), alpha: 0 };
        lab.dirty = true;
        const dur = reduced ? 0 : 0.9;
        lab.rows.forEach((r, k) => gsap.to(r, { y: yOf(k + 1), alpha: 1, duration: dur, delay: k * 0.1, ease: 'power3.out', onUpdate: () => { lab.dirty = true; } }));
        gsap.to(lab.resRow, { y: yOf(imfs.length + 1), alpha: 1, duration: dur, delay: imfs.length * 0.1, ease: 'power3.out', onUpdate: () => { lab.dirty = true; } });
        const total = lab.x.reduce((s, v) => s + v * v, 0) || 1;
        $('#lab-stats').innerHTML = imfs.map((imf, k) => {
            const f = DSP.dominantFreq(imf, FS);
            const en = imf.reduce((s, v) => s + v * v, 0) / total * 100;
            return `<span style="color:${IMF[k]}">IMF${k + 1}</span><span>≈ <b>${f.toFixed(1)} Hz</b> · 能量 ${en.toFixed(0)}% · 音高 ${Math.round(clamp(f * 40, 55, 2200))} Hz</span>`;
        }).map((s, i, arr) => `<span style="display:flex;gap:8px;justify-content:space-between">${s}</span>`).join('');
    }
    function drawLab() {
        const { ctx, w, h } = setupCanvas(labCanvas);
        ctx.clearRect(0, 0, w, h);
        const L = 64, R = w - 16;
        const { rowH, yOf } = labRows();
        const scAll = rowH * 0.42 / maxAbs(lab.x);
        const drawRow = (data, y, color, name, alpha, muted, scale) => {
            ctx.save(); ctx.strokeStyle = ink(0.05); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); ctx.restore();
            polyline(ctx, mapPts(data, L, R, y, scale), color, muted ? 1 : 1.4, muted ? 0 : 10, alpha * (muted ? 0.28 : 0.95));
            ctx.save(); ctx.globalAlpha = alpha;
            label(ctx, name, 14, y, muted ? ink(0.3) : color, 10);
            if (muted) label(ctx, 'mute', 14, y + 13, ink(0.3), 9);
            ctx.restore();
        };
        drawRow(lab.x, yOf(0), CYAN, '原始', 1, false, scAll);
        if (lab.stale) label(ctx, '參數已變更 — 按「分解」更新 IMF', R, yOf(0) - rowH * 0.42, ink(0.5), 10, 'right');
        lab.imfs.forEach((imf, k) => {
            const r = lab.rows[k];
            const sc = Math.min(scAll * 1.6, rowH * 0.42 / maxAbs(imf));
            drawRow(imf, r.y, IMF[k % IMF.length], `IMF${k + 1}`, r.alpha * (lab.stale ? 0.4 : 1), lab.muted.has(k), sc);
        });
        if (lab.residue) drawRow(lab.residue, lab.resRow.y, ink(0.6), '殘餘', lab.resRow.alpha * (lab.stale ? 0.4 : 1), false, scAll);
        if (lab.playing) {
            const p = clamp((performance.now() - lab.playStart) / 4000, 0, 1);
            const px = L + (R - L) * p;
            ctx.save(); ctx.strokeStyle = ink(1); ctx.shadowColor = CYAN; ctx.shadowBlur = 16; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px, 6); ctx.lineTo(px, h - 6); ctx.stroke(); ctx.restore();
            lab.dirty = true;
        } else if (lab.hover >= 0) {
            const px = L + (R - L) * lab.hover / (lab.N - 1);
            ctx.save(); ctx.strokeStyle = ink(0.35); ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(px, 6); ctx.lineTo(px, h - 6); ctx.stroke(); ctx.restore();
        }
    }
    labCanvas.addEventListener('pointermove', e => {
        const r = labCanvas.getBoundingClientRect();
        const L = 64, R = r.width - 16;
        const i = Math.round(clamp((e.clientX - r.left - L) / (R - L), 0, 1) * (lab.N - 1));
        lab.hover = i; lab.dirty = true;
        const { rowH } = labRows();
        const rowK = Math.floor((e.clientY - r.top - 10) / rowH);
        let txt = `t = ${(i / FS).toFixed(2)} s`;
        if (rowK === 0) txt += ` · x = ${lab.x[i].toFixed(2)}`;
        else if (rowK >= 1 && rowK <= lab.imfs.length && !lab.stale) {
            const imf = lab.imfs[rowK - 1];
            const { freq } = DSP.instFreq(imf, FS, 15);
            txt += ` · IMF${rowK} = ${imf[i].toFixed(2)} · f ≈ ${freq[i].toFixed(1)} Hz`;
        }
        labTip.textContent = txt;
        labTip.style.opacity = 1;
        labTip.style.left = `${clamp(e.clientX - r.left + 14, 8, r.width - 240)}px`;
        labTip.style.top = `${e.clientY - r.top - 30}px`;
    });
    labCanvas.addEventListener('pointerleave', () => { lab.hover = -1; lab.dirty = true; labTip.style.opacity = 0; });
    labCanvas.addEventListener('click', e => {
        if (!lab.imfs.length) return;
        const r = labCanvas.getBoundingClientRect();
        const { rowH } = labRows();
        const k = Math.floor((e.clientY - r.top - 10) / rowH) - 1;
        if (k >= 0 && k < lab.imfs.length) { lab.muted.has(k) ? lab.muted.delete(k) : lab.muted.add(k); lab.dirty = true; }
    });
    for (const k in sliders) sliders[k].addEventListener('input', () => { labSyncOutputs(); labGenerate(); if (lab.imfs.length) lab.stale = true; });
    $$('.lab-presets .chip').forEach(btn => btn.addEventListener('click', () => {
        $$('.lab-presets .chip').forEach(b => b.classList.remove('active')); btn.classList.add('active');
        const st = DSP.STAGES[+btn.dataset.preset];
        for (const k in sliders) sliders[k].value = st[k];
        lab.kc = st.kc; lab.saw = st.saw;
        labSyncOutputs(); labRun();
    }));
    $('#lab-run').addEventListener('click', labRun);

    function stopAudio() {
        lab.nodes.forEach(n => { try { n.stop && n.stop(); n.disconnect(); } catch (e) { } });
        lab.nodes = []; lab.playing = false; lab.dirty = true;
        $('#lab-listen').textContent = '♪ 聆聽 IMF';
    }
    function labListen() {
        if (lab.playing) { stopAudio(); return; }
        if (!lab.imfs.length || lab.stale) labRun();
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        lab.audio = lab.audio || new AC();
        const ac = lab.audio; ac.resume();
        const dur = 4, now = ac.currentTime + 0.05;
        const master = ac.createGain(); master.gain.value = 0.8;
        const comp = ac.createDynamicsCompressor();
        master.connect(comp); comp.connect(ac.destination);
        lab.nodes.push(master, comp);
        const envs = lab.imfs.map(imf => DSP.instFreq(imf, FS, 9).amp);
        let gmax = 0; envs.forEach(a => a.forEach(v => { if (v > gmax) gmax = v; }));
        lab.imfs.forEach((imf, k) => {
            if (lab.muted.has(k)) return;
            const f = clamp(DSP.dominantFreq(imf, FS) * 40, 55, 2200);
            const osc = ac.createOscillator(); osc.type = k === 0 ? 'triangle' : 'sine'; osc.frequency.value = f;
            const g = ac.createGain();
            const M = 128, curve = new Float32Array(M);
            for (let i = 0; i < M; i++) {
                const src = envs[k][Math.min(envs[k].length - 1, Math.floor(i / M * envs[k].length))] / (gmax || 1);
                const fade = Math.min(1, i / 4, (M - 1 - i) / 4);
                curve[i] = src * 0.32 * fade;
            }
            g.gain.setValueAtTime(0, now);
            g.gain.setValueCurveAtTime(curve, now, dur);
            osc.connect(g); g.connect(master);
            osc.start(now); osc.stop(now + dur + 0.05);
            lab.nodes.push(osc, g);
        });
        lab.playing = true; lab.playStart = performance.now() + 50; lab.dirty = true;
        $('#lab-listen').textContent = '■ 停止';
        setTimeout(() => { if (lab.playing) stopAudio(); }, (dur + 0.15) * 1000);
    }
    $('#lab-listen').addEventListener('click', labListen);

    // ---------- theme ----------
    const themeBtn = $('#theme-toggle');
    function applyTheme(dark, persist = true) {
        TH.dark = dark; TH.glow = dark ? 1 : 0.35;
        IMF = dark ? IMF_DARK : IMF_LIGHT;
        CYAN = dark ? '#33e1ff' : '#0e7490';
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#05060a' : '#f6f7fb');
        themeBtn.querySelector('.tt-icon').textContent = dark ? '☾' : '☀';
        themeBtn.querySelector('.tt-text').textContent = dark ? '夜間' : '日間';
        themeBtn.setAttribute('aria-pressed', String(!dark));
        if (persist) { try { localStorage.setItem('emd-theme', dark ? 'dark' : 'light'); } catch (e) { } }
        lab.dirty = true; duel.fftDrawn = false;
        if (window.HHT3D) window.HHT3D.setTheme(dark);
    }
    themeBtn.addEventListener('click', () => applyTheme(!TH.dark));
    addEventListener('hht3d-ready', () => window.HHT3D.setTheme(TH.dark));

    // ---------- timeline drag ----------
    const tl = $('#timeline');
    let drag = null;
    tl.addEventListener('pointerdown', e => { drag = { x: e.clientX, sl: tl.scrollLeft }; tl.style.scrollSnapType = 'none'; });
    addEventListener('pointermove', e => { if (drag) tl.scrollLeft = drag.sl - (e.clientX - drag.x); });
    addEventListener('pointerup', () => { drag = null; tl.style.scrollSnapType = ''; });

    // ---------- reveals ----------
    const heroStart = performance.now();
    const revealIO = new IntersectionObserver(entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('.section .h2, .section .lead, .duel-panel, .duel-signal, .sift-stage, .lab-panel, .lab-view, .hht3d-stage, .imf-card, .paper, .limit, .about-text, .fact').forEach(el => {
        el.classList.add('rv'); revealIO.observe(el);
    });
    const chapterIO = new IntersectionObserver(entries => entries.forEach(e => {
        e.target.querySelector('.chapter-card').classList.toggle('in', e.isIntersecting);
    }), { rootMargin: '-38% 0px -38% 0px', threshold: 0 });
    $$('.chapter').forEach(ch => chapterIO.observe(ch));

    // ---------- master loop ----------
    watch($('#top'), 'hero'); watch(journeySec, 'journey'); watch($('#fourier'), 'duel'); watch($('#sifting'), 'sift'); watch($('#lab'), 'lab');
    let last = performance.now();
    function loop(now) {
        requestAnimationFrame(loop);
        const dt = Math.min(64, now - last); last = now;
        cursorTick();
        if (!reduced) heroReveal = ease(clamp((now - heroStart - 300) / 2600, 0, 1));
        if (vis.hero) drawHero(now);
        if (vis.journey) { journey.progress = journeyProgress(); updateJourneyUI(); drawJourney(now); drawHypno(); }
        if (vis.duel) drawDuel(now);
        if (vis.sift) { siftAdvance(dt); drawSift(); }
        if (vis.lab && lab.dirty) { drawLab(); if (!lab.playing) lab.dirty = false; }
    }
    addEventListener('resize', () => { lab.dirty = true; duel.fftDrawn = false; });

    applyTheme(document.documentElement.dataset.theme !== 'light', false);
    initDuel();
    siftReset();
    labSyncOutputs();
    labRun();
    requestAnimationFrame(loop);
})();
