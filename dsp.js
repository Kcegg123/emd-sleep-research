const DSP = (() => {
    function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

    function fft(re, im) {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                [re[i], re[j]] = [re[j], re[i]];
                [im[i], im[j]] = [im[j], im[i]];
            }
        }
        for (let len = 2; len <= n; len <<= 1) {
            const ang = -2 * Math.PI / len;
            const wr = Math.cos(ang), wi = Math.sin(ang);
            const half = len >> 1;
            for (let i = 0; i < n; i += len) {
                let cr = 1, ci = 0;
                for (let j = 0; j < half; j++) {
                    const a = i + j, b = a + half;
                    const vr = re[b] * cr - im[b] * ci;
                    const vi = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - vr; im[b] = im[a] - vi;
                    re[a] += vr; im[a] += vi;
                    const ncr = cr * wr - ci * wi;
                    ci = cr * wi + ci * wr;
                    cr = ncr;
                }
            }
        }
    }

    function ifft(re, im) {
        const n = re.length;
        for (let i = 0; i < n; i++) im[i] = -im[i];
        fft(re, im);
        for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
    }

    function spectrum(x, fs) {
        const N = nextPow2(x.length) * 2;
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < x.length; i++) {
            const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (x.length - 1));
            re[i] = x[i] * w;
        }
        fft(re, im);
        const mag = [], freq = [];
        for (let k = 0; k <= N / 2; k++) {
            mag.push(Math.hypot(re[k], im[k]));
            freq.push(k * fs / N);
        }
        return { mag, freq };
    }

    function analytic(x) {
        const N = nextPow2(x.length);
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < x.length; i++) re[i] = x[i];
        fft(re, im);
        for (let k = 1; k < N; k++) {
            if (k === N / 2) continue;
            if (k < N / 2) { re[k] *= 2; im[k] *= 2; }
            else { re[k] = 0; im[k] = 0; }
        }
        ifft(re, im);
        const amp = new Array(x.length), phase = new Array(x.length);
        for (let i = 0; i < x.length; i++) {
            amp[i] = Math.hypot(re[i], im[i]);
            phase[i] = Math.atan2(im[i], re[i]);
        }
        return { amp, phase };
    }

    function movavg(a, w) {
        const h = Math.floor(w / 2);
        const out = new Array(a.length);
        for (let i = 0; i < a.length; i++) {
            let s = 0, c = 0;
            for (let j = Math.max(0, i - h); j <= Math.min(a.length - 1, i + h); j++) { s += a[j]; c++; }
            out[i] = s / c;
        }
        return out;
    }

    function instFreq(x, fs, smooth = 9) {
        const { amp, phase } = analytic(x);
        const n = x.length;
        const f = new Array(n);
        for (let i = 0; i < n; i++) {
            const i1 = Math.min(i + 1, n - 1), i0 = Math.max(i - 1, 0);
            let d = phase[i1] - phase[i0];
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            f[i] = Math.abs(d) * fs / (2 * Math.PI * (i1 - i0));
        }
        return { freq: movavg(f, smooth), amp: movavg(amp, 5) };
    }

    function dominantFreq(x, fs) {
        const { freq, amp } = instFreq(x, fs);
        let s = 0, w = 0;
        for (let i = 0; i < freq.length; i++) { s += freq[i] * amp[i]; w += amp[i]; }
        return w ? s / w : 0;
    }

    const NOISE = Array.from({ length: 16384 }, () => Math.random() * 2 - 1);
    function noiseAt(i) { return NOISE[((i | 0) % NOISE.length + NOISE.length) % NOISE.length]; }

    const STAGES = [
        { key: 'wake', name: '清醒', en: 'Wake', hue: 38, delta: 0.15, theta: 0.2, alpha: 1.0, sigma: 0, beta: 0.55, kc: 0, saw: 0, noise: 0.15 },
        { key: 'n1', name: 'N1 入睡', en: 'N1', hue: 208, delta: 0.3, theta: 0.9, alpha: 0.35, sigma: 0, beta: 0.15, kc: 0, saw: 0, noise: 0.12 },
        { key: 'n2', name: 'N2 淺睡', en: 'N2', hue: 268, delta: 0.6, theta: 0.6, alpha: 0.1, sigma: 1.0, beta: 0.1, kc: 1, saw: 0, noise: 0.1 },
        { key: 'n3', name: 'N3 深睡', en: 'N3', hue: 160, delta: 2.0, theta: 0.3, alpha: 0.05, sigma: 0.2, beta: 0.05, kc: 0, saw: 0, noise: 0.08 },
        { key: 'rem', name: 'REM 快速動眼', en: 'REM', hue: 328, delta: 0.25, theta: 0.6, alpha: 0.2, sigma: 0, beta: 0.35, kc: 0, saw: 0.8, noise: 0.2 }
    ];

    function lerp(a, b, t) { return a + (b - a) * t; }

    function stageParams(p) {
        const seg = Math.min(STAGES.length - 2, Math.floor(p * (STAGES.length - 1)));
        const t = p * (STAGES.length - 1) - seg;
        const A = STAGES[seg], B = STAGES[seg + 1];
        const out = {};
        for (const k of Object.keys(A)) {
            out[k] = typeof A[k] === 'number' ? lerp(A[k], B[k], t) : (t < 0.5 ? A[k] : B[k]);
        }
        out.blend = t;
        out.seg = seg;
        return out;
    }

    function bands(tau, p) {
        const delta = p.delta * Math.sin(2 * Math.PI * 1.6 * tau + 0.4 * Math.sin(2 * Math.PI * 0.12 * tau));
        const theta = p.theta * Math.sin(2 * Math.PI * 6 * tau + 0.3 * Math.sin(2 * Math.PI * 0.35 * tau));
        const alphaEnv = 0.65 + 0.35 * Math.sin(2 * Math.PI * 0.5 * tau);
        const alpha = p.alpha * alphaEnv * Math.sin(2 * Math.PI * 10 * tau);
        const spEnv = Math.exp(-(((tau % 2.6) - 1.3) ** 2) / 0.03);
        const sigma = p.sigma * spEnv * Math.sin(2 * Math.PI * 13 * tau);
        const beta = p.beta * Math.sin(2 * Math.PI * 22 * tau) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 1.3 * tau));
        const kt = (tau % 4.1) - 2.0;
        const kc = p.kc * (-1.6 * Math.exp(-(kt ** 2) / 0.006) + 1.0 * Math.exp(-((kt - 0.28) ** 2) / 0.012));
        const sawEnv = Math.exp(-(((tau % 3.3) - 1.6) ** 2) / 0.15);
        const sawPhase = (tau * 3) % 1;
        const saw = p.saw * sawEnv * (2 * sawPhase - 1);
        return { delta, theta, alpha, sigma, beta, kc, saw };
    }

    function synth(n, fs, p, tau0 = 0) {
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
            const tau = tau0 + i / fs;
            const b = bands(tau, p);
            out[i] = b.delta + b.theta + b.alpha + b.sigma + b.beta + b.kc + b.saw +
                p.noise * noiseAt(Math.round(tau * fs));
        }
        return out;
    }

    return { fft, ifft, spectrum, analytic, instFreq, movavg, dominantFreq, nextPow2, noiseAt, STAGES, stageParams, bands, synth, lerp };
})();
