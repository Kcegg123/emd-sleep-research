/**
 * EMD (Empirical Mode Decomposition) implementation in JavaScript.
 */
const EMD = (() => {

    function findLocalMaxima(data) {
        const maxima = [];
        for (let i = 1; i < data.length - 1; i++) {
            if (data[i] > data[i - 1] && data[i] >= data[i + 1]) {
                maxima.push(i);
            }
        }
        return maxima;
    }

    function findLocalMinima(data) {
        const minima = [];
        for (let i = 1; i < data.length - 1; i++) {
            if (data[i] < data[i - 1] && data[i] <= data[i + 1]) {
                minima.push(i);
            }
        }
        return minima;
    }

    function cubicSplineInterpolate(knots, values, xs) {
        const n = knots.length;
        if (n < 2) return xs.map(() => values[0] || 0);
        if (n === 2) {
            const slope = (values[1] - values[0]) / (knots[1] - knots[0]);
            return xs.map(x => values[0] + slope * (x - knots[0]));
        }

        const h = [];
        const alpha = [0];
        for (let i = 0; i < n - 1; i++) {
            h.push(knots[i + 1] - knots[i]);
        }
        for (let i = 1; i < n - 1; i++) {
            alpha.push(
                (3 / h[i]) * (values[i + 1] - values[i]) -
                (3 / h[i - 1]) * (values[i] - values[i - 1])
            );
        }

        const l = [1];
        const mu = [0];
        const z = [0];
        for (let i = 1; i < n - 1; i++) {
            l.push(2 * (knots[i + 1] - knots[i - 1]) - h[i - 1] * mu[i - 1]);
            mu.push(h[i] / l[i]);
            z.push((alpha[i] - h[i - 1] * z[i - 1]) / l[i]);
        }

        const c = new Array(n).fill(0);
        const b = new Array(n - 1).fill(0);
        const d = new Array(n - 1).fill(0);

        for (let j = n - 2; j >= 0; j--) {
            c[j] = z[j] - mu[j] * c[j + 1];
            if (j < n - 1) {
                b[j] = (values[j + 1] - values[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
                d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
            }
        }

        return xs.map(x => {
            let seg = n - 2;
            for (let i = 0; i < n - 1; i++) {
                if (x <= knots[i + 1]) { seg = i; break; }
            }
            const dx = x - knots[seg];
            return values[seg] + b[seg] * dx + c[seg] * dx * dx + d[seg] * dx * dx * dx;
        });
    }

    function computeEnvelope(data, indices) {
        if (indices.length < 2) {
            const mean = indices.length === 1 ? data[indices[0]] : 0;
            return new Array(data.length).fill(mean);
        }

        const knots = [0, ...indices, data.length - 1];
        const vals = [data[0], ...indices.map(i => data[i]), data[data.length - 1]];

        const unique = [];
        const uvals = [];
        for (let i = 0; i < knots.length; i++) {
            if (i === 0 || knots[i] !== knots[i - 1]) {
                unique.push(knots[i]);
                uvals.push(vals[i]);
            }
        }

        const xs = Array.from({ length: data.length }, (_, i) => i);
        return cubicSplineInterpolate(unique, uvals, xs);
    }

    function isIMF(data, maxIter) {
        const maxima = findLocalMaxima(data);
        const minima = findLocalMinima(data);
        let zeroCrossings = 0;
        for (let i = 1; i < data.length; i++) {
            if (data[i] * data[i - 1] < 0) zeroCrossings++;
        }
        const extrema = maxima.length + minima.length;
        return Math.abs(extrema - zeroCrossings) <= 1 || maxIter <= 0;
    }

    function siftOnce(data) {
        const maxima = findLocalMaxima(data);
        const minima = findLocalMinima(data);

        if (maxima.length < 2 || minima.length < 2) {
            return { result: data, upperEnv: null, lowerEnv: null, mean: null, done: true };
        }

        const upperEnv = computeEnvelope(data, maxima);
        const lowerEnv = computeEnvelope(data, minima);
        const mean = upperEnv.map((v, i) => (v + lowerEnv[i]) / 2);
        const result = data.map((v, i) => v - mean[i]);

        return { result, upperEnv, lowerEnv, mean, done: false };
    }

    function extractIMF(data, maxSiftings = 15) {
        let h = [...data];
        const siftingSteps = [];

        for (let i = 0; i < maxSiftings; i++) {
            const { result, upperEnv, lowerEnv, mean, done } = siftOnce(h);

            siftingSteps.push({
                iteration: i + 1,
                signal: [...h],
                upperEnv: upperEnv ? [...upperEnv] : null,
                lowerEnv: lowerEnv ? [...lowerEnv] : null,
                mean: mean ? [...mean] : null,
                result: [...result]
            });

            if (done) break;

            h = result;

            if (isIMF(h, maxSiftings - i - 1)) {
                let sd = 0;
                const prev = siftingSteps.length > 1 ?
                    siftingSteps[siftingSteps.length - 2].result : data;
                for (let j = 0; j < h.length; j++) {
                    const denom = prev[j] * prev[j] || 1e-10;
                    sd += (h[j] - prev[j]) ** 2 / denom;
                }
                sd /= h.length;
                if (sd < 0.3) break;
            }
        }

        return { imf: h, siftingSteps };
    }

    function decompose(data, maxIMFs = 8, maxSiftings = 15) {
        const imfs = [];
        const allSiftingSteps = [];
        let residue = [...data];

        for (let i = 0; i < maxIMFs; i++) {
            const maxima = findLocalMaxima(residue);
            const minima = findLocalMinima(residue);
            if (maxima.length < 2 || minima.length < 2) break;

            const { imf, siftingSteps } = extractIMF(residue, maxSiftings);
            imfs.push(imf);
            allSiftingSteps.push(siftingSteps);
            residue = residue.map((v, j) => v - imf[j]);
        }

        return { imfs, residue, siftingSteps: allSiftingSteps };
    }

    function generateSleepEEG(length, params = {}) {
        const {
            deltaAmp = 1.0,
            thetaAmp = 0.5,
            alphaAmp = 0.3,
            spindleAmp = 0.4,
            noiseAmp = 0.1,
            sampleRate = 256
        } = params;

        const data = [];
        const dt = 1 / sampleRate;

        for (let i = 0; i < length; i++) {
            const t = i * dt;
            let val = 0;

            val += deltaAmp * Math.sin(2 * Math.PI * 2 * t + 0.3 * Math.sin(2 * Math.PI * 0.1 * t));
            val += thetaAmp * Math.sin(2 * Math.PI * 6 * t + 0.2 * Math.sin(2 * Math.PI * 0.3 * t));
            val += alphaAmp * Math.sin(2 * Math.PI * 10 * t);

            const spindleEnv = Math.exp(-((t % 2 - 1) ** 2) / 0.02);
            val += spindleAmp * spindleEnv * Math.sin(2 * Math.PI * 13 * t);

            val += noiseAmp * (Math.random() * 2 - 1);

            data.push(val);
        }
        return data;
    }

    function generateMixedSine(length) {
        const data = [];
        for (let i = 0; i < length; i++) {
            const t = i / 256;
            data.push(
                Math.sin(2 * Math.PI * 3 * t) +
                0.5 * Math.sin(2 * Math.PI * 10 * t) +
                0.3 * Math.sin(2 * Math.PI * 25 * t) +
                0.05 * (Math.random() * 2 - 1)
            );
        }
        return data;
    }

    function generateChirp(length) {
        const data = [];
        for (let i = 0; i < length; i++) {
            const t = i / 256;
            const T = length / 256;
            const freq = 2 + 20 * t / T;
            data.push(Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * 2 * t));
        }
        return data;
    }

    function generateStageSignal(stage, length = 512) {
        const data = [];
        const sr = 256;
        for (let i = 0; i < length; i++) {
            const t = i / sr;
            let val = 0;
            switch (stage) {
                case 'wake':
                    val = 0.8 * Math.sin(2 * Math.PI * 10 * t) +
                          0.6 * Math.sin(2 * Math.PI * 20 * t) +
                          0.3 * Math.sin(2 * Math.PI * 4 * t) +
                          0.1 * (Math.random() * 2 - 1);
                    break;
                case 'n1':
                    val = 0.7 * Math.sin(2 * Math.PI * 6 * t) +
                          0.2 * Math.sin(2 * Math.PI * 10 * t) +
                          0.3 * Math.sin(2 * Math.PI * 3 * t) +
                          0.1 * (Math.random() * 2 - 1);
                    break;
                case 'n2':
                    val = 0.5 * Math.sin(2 * Math.PI * 5 * t) +
                          0.4 * Math.exp(-((t % 1.5 - 0.75) ** 2) / 0.01) *
                          Math.sin(2 * Math.PI * 13 * t) +
                          0.3 * Math.sin(2 * Math.PI * 2 * t) +
                          0.1 * (Math.random() * 2 - 1);
                    break;
                case 'n3':
                    val = 1.5 * Math.sin(2 * Math.PI * 1.5 * t) +
                          0.8 * Math.sin(2 * Math.PI * 3 * t) +
                          0.15 * Math.sin(2 * Math.PI * 8 * t) +
                          0.08 * (Math.random() * 2 - 1);
                    break;
                case 'rem':
                    val = 0.4 * Math.sin(2 * Math.PI * 5 * t + Math.sin(2 * Math.PI * 0.5 * t)) +
                          0.3 * Math.sin(2 * Math.PI * 12 * t) +
                          0.3 * Math.sin(2 * Math.PI * 2 * t) +
                          0.2 * (Math.random() * 2 - 1);
                    break;
            }
            data.push(val);
        }
        return data;
    }

    function hilbertTransform(imfs, sampleRate = 256) {
        const result = [];
        for (const imf of imfs) {
            const n = imf.length;
            const instFreq = [];
            const instAmp = [];

            for (let i = 1; i < n - 1; i++) {
                const analytic = Math.sqrt(imf[i] ** 2 +
                    ((imf[i + 1] - imf[i - 1]) / 2) ** 2);
                instAmp.push(analytic || 0.001);

                const phase1 = Math.atan2((imf[i + 1] - imf[i - 1]) / 2, imf[i]);
                const phase0 = Math.atan2((imf[i] - imf[i - 2 < 0 ? 0 : i - 2]) / 2, imf[i - 1]);
                let dPhase = phase1 - phase0;
                if (dPhase > Math.PI) dPhase -= 2 * Math.PI;
                if (dPhase < -Math.PI) dPhase += 2 * Math.PI;
                instFreq.push(Math.abs(dPhase * sampleRate / (2 * Math.PI)));
            }

            result.push({ instFreq, instAmp });
        }
        return result;
    }

    return {
        decompose,
        extractIMF,
        siftOnce,
        findLocalMaxima,
        findLocalMinima,
        computeEnvelope,
        generateSleepEEG,
        generateMixedSine,
        generateChirp,
        generateStageSignal,
        hilbertTransform
    };
})();
