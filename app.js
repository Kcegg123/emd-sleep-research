(() => {
    'use strict';

    const COLORS = {
        original: '#60a5fa',
        imf: ['#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#c084fc', '#fb923c'],
        upper: '#4ade80',
        lower: '#f87171',
        mean: '#fbbf24',
        residue: '#94a3b8',
        grid: 'rgba(148, 163, 184, 0.1)'
    };

    const charts = {};
    let currentSignal = [];
    let currentResult = null;
    let siftingAnimState = null;

    function getChartDefaults() {
        const style = getComputedStyle(document.documentElement);
        const textColor = style.getPropertyValue('--text-secondary').trim() || '#94a3b8';
        return {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 3.5,
            animation: { duration: 600 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#e8edf5',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { color: COLORS.grid },
                    ticks: { color: textColor, maxTicksLimit: 8, font: { size: 10 } },
                    title: { display: false }
                },
                y: {
                    display: true,
                    grid: { color: COLORS.grid },
                    ticks: { color: textColor, maxTicksLimit: 5, font: { size: 10 } }
                }
            },
            elements: {
                point: { radius: 0 },
                line: { borderWidth: 1.5 }
            }
        };
    }

    function createLineChart(canvasId, label, data, color, extraDatasets = []) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        if (charts[canvasId]) {
            charts[canvasId].destroy();
        }

        const labels = data.map((_, i) => i);
        const datasets = [
            {
                label,
                data,
                borderColor: color,
                backgroundColor: color + '20',
                fill: false,
                tension: 0.1
            },
            ...extraDatasets
        ];

        charts[canvasId] = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: getChartDefaults()
        });

        return charts[canvasId];
    }

    function updateSliderLabels() {
        document.getElementById('delta-val').textContent = document.getElementById('delta-amp').value;
        document.getElementById('theta-val').textContent = document.getElementById('theta-amp').value;
        document.getElementById('alpha-val').textContent = document.getElementById('alpha-amp').value;
        document.getElementById('spindle-val').textContent = document.getElementById('spindle-amp').value;
        document.getElementById('noise-val').textContent = document.getElementById('noise-amp').value;
    }

    function generateSignal() {
        const type = document.getElementById('signal-type').value;
        const length = 512;

        switch (type) {
            case 'sleep-eeg':
                return EMD.generateSleepEEG(length, {
                    deltaAmp: parseFloat(document.getElementById('delta-amp').value),
                    thetaAmp: parseFloat(document.getElementById('theta-amp').value),
                    alphaAmp: parseFloat(document.getElementById('alpha-amp').value),
                    spindleAmp: parseFloat(document.getElementById('spindle-amp').value),
                    noiseAmp: parseFloat(document.getElementById('noise-amp').value)
                });
            case 'mixed-sine':
                return EMD.generateMixedSine(length);
            case 'chirp':
                return EMD.generateChirp(length);
            case 'custom':
                return EMD.generateSleepEEG(length, {
                    deltaAmp: parseFloat(document.getElementById('delta-amp').value),
                    thetaAmp: parseFloat(document.getElementById('theta-amp').value),
                    alphaAmp: parseFloat(document.getElementById('alpha-amp').value),
                    spindleAmp: parseFloat(document.getElementById('spindle-amp').value),
                    noiseAmp: parseFloat(document.getElementById('noise-amp').value)
                });
            default:
                return EMD.generateSleepEEG(length);
        }
    }

    function plotOriginalSignal() {
        currentSignal = generateSignal();
        createLineChart('chart-original', '原始信號', currentSignal, COLORS.original);
    }

    function runEMD() {
        currentSignal = generateSignal();
        createLineChart('chart-original', '原始信號', currentSignal, COLORS.original);

        currentResult = EMD.decompose(currentSignal, 6, 12);
        const container = document.getElementById('imf-charts');
        container.innerHTML = '';

        currentResult.imfs.forEach((imf, idx) => {
            const panel = document.createElement('div');
            panel.className = 'chart-panel';
            panel.innerHTML = `<h3>IMF ${idx + 1}</h3><canvas id="chart-imf-${idx}"></canvas>`;
            container.appendChild(panel);

            setTimeout(() => {
                createLineChart(`chart-imf-${idx}`, `IMF ${idx + 1}`, imf, COLORS.imf[idx % COLORS.imf.length]);
            }, idx * 100);
        });

        const residuePanel = document.getElementById('residue-panel');
        residuePanel.style.display = 'block';
        setTimeout(() => {
            createLineChart('chart-residue', '殘餘量', currentResult.residue, COLORS.residue);
        }, currentResult.imfs.length * 100);

        showSiftingInfo(currentResult);
    }

    let stepIMFIndex = 0;
    let stepAccumulatedIMFs = [];

    function stepEMD() {
        if (!currentSignal.length) {
            currentSignal = generateSignal();
            createLineChart('chart-original', '原始信號', currentSignal, COLORS.original);
            stepIMFIndex = 0;
            stepAccumulatedIMFs = [];
        }

        let residue = [...currentSignal];
        for (const imf of stepAccumulatedIMFs) {
            residue = residue.map((v, i) => v - imf[i]);
        }

        const maxima = EMD.findLocalMaxima(residue);
        const minima = EMD.findLocalMinima(residue);
        if (maxima.length < 2 || minima.length < 2) {
            const residuePanel = document.getElementById('residue-panel');
            residuePanel.style.display = 'block';
            createLineChart('chart-residue', '殘餘量', residue, COLORS.residue);
            return;
        }

        const { imf } = EMD.extractIMF(residue, 12);
        stepAccumulatedIMFs.push(imf);

        const container = document.getElementById('imf-charts');
        const panel = document.createElement('div');
        const idx = stepIMFIndex;
        panel.className = 'chart-panel';
        panel.innerHTML = `<h3>IMF ${idx + 1}</h3><canvas id="chart-imf-${idx}"></canvas>`;
        container.appendChild(panel);

        setTimeout(() => {
            createLineChart(`chart-imf-${idx}`, `IMF ${idx + 1}`, imf, COLORS.imf[idx % COLORS.imf.length]);
        }, 50);

        stepIMFIndex++;
    }

    function resetEMD() {
        document.getElementById('imf-charts').innerHTML = '';
        document.getElementById('residue-panel').style.display = 'none';
        document.getElementById('sifting-info').style.display = 'none';
        currentResult = null;
        stepIMFIndex = 0;
        stepAccumulatedIMFs = [];
        plotOriginalSignal();
    }

    function showSiftingInfo(result) {
        const info = document.getElementById('sifting-info');
        const details = document.getElementById('sifting-details');
        info.style.display = 'block';

        let html = '<table style="width:100%;font-size:0.9rem"><thead><tr><th>IMF</th><th>篩選次數</th><th>極大值數</th><th>極小值數</th></tr></thead><tbody>';

        result.imfs.forEach((imf, i) => {
            const maxCount = EMD.findLocalMaxima(imf).length;
            const minCount = EMD.findLocalMinima(imf).length;
            const sifts = result.siftingSteps[i] ? result.siftingSteps[i].length : '—';
            html += `<tr><td>IMF ${i + 1}</td><td>${sifts}</td><td>${maxCount}</td><td>${minCount}</td></tr>`;
        });

        html += '</tbody></table>';
        details.innerHTML = html;
    }

    // -- Sifting animation --
    const SIFT_EXPLANATIONS = [
        '步驟一：辨識原始信號（或殘餘量）的所有局部極大值與極小值。',
        '步驟二：以三次樣條內插連接極大值（綠色上包絡線）與極小值（紅色下包絡線）。',
        '步驟三：計算上下包絡線的平均值（黃色均值線）。',
        '步驟四：從信號中減去均值，得到候選 IMF。若不滿足 IMF 條件，重複篩選。',
        '篩選完成！提取出一個 IMF 成分。'
    ];

    function initSiftingDemo() {
        const signal = EMD.generateSleepEEG(512, { deltaAmp: 1, thetaAmp: 0.6, alphaAmp: 0.3, spindleAmp: 0.4, noiseAmp: 0.08 });
        siftingAnimState = {
            signal,
            current: [...signal],
            step: 0,
            iteration: 0,
            autoPlaying: false
        };
        plotSiftingStep();
    }

    function plotSiftingStep() {
        if (!siftingAnimState) return;
        const { current, step } = siftingAnimState;
        const canvas = document.getElementById('chart-sifting');
        if (!canvas) return;

        const labels = current.map((_, i) => i);
        const datasets = [{
            label: '當前信號',
            data: current,
            borderColor: COLORS.original,
            fill: false,
            tension: 0.1
        }];

        if (step >= 1) {
            const maxima = EMD.findLocalMaxima(current);
            const minima = EMD.findLocalMinima(current);

            const maxPts = new Array(current.length).fill(null);
            const minPts = new Array(current.length).fill(null);
            maxima.forEach(i => maxPts[i] = current[i]);
            minima.forEach(i => minPts[i] = current[i]);

            datasets.push({
                label: '極大值',
                data: maxPts,
                borderColor: COLORS.upper,
                backgroundColor: COLORS.upper,
                pointRadius: 4,
                pointStyle: 'circle',
                showLine: false
            });
            datasets.push({
                label: '極小值',
                data: minPts,
                borderColor: COLORS.lower,
                backgroundColor: COLORS.lower,
                pointRadius: 4,
                pointStyle: 'circle',
                showLine: false
            });

            if (step >= 2) {
                const upperEnv = EMD.computeEnvelope(current, maxima);
                const lowerEnv = EMD.computeEnvelope(current, minima);

                datasets.push({
                    label: '上包絡線',
                    data: upperEnv,
                    borderColor: COLORS.upper,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3
                });
                datasets.push({
                    label: '下包絡線',
                    data: lowerEnv,
                    borderColor: COLORS.lower,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3
                });

                if (step >= 3) {
                    const mean = upperEnv.map((v, i) => (v + lowerEnv[i]) / 2);
                    datasets.push({
                        label: '均值包絡',
                        data: mean,
                        borderColor: COLORS.mean,
                        borderWidth: 2,
                        fill: false,
                        tension: 0.3
                    });
                }
            }
        }

        if (charts['chart-sifting']) charts['chart-sifting'].destroy();

        const opts = getChartDefaults();
        opts.aspectRatio = 2.5;
        opts.plugins.legend = { display: true, labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim(), boxWidth: 12, font: { size: 11 } } };

        charts['chart-sifting'] = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: opts
        });

        const explIdx = Math.min(step, SIFT_EXPLANATIONS.length - 1);
        document.getElementById('sift-explanation').textContent = step === 0 ?
            '點擊「開始篩選動畫」或「下一步」來觀察 EMD 篩選過程。' :
            `迭代 ${siftingAnimState.iteration + 1} — ${SIFT_EXPLANATIONS[explIdx]}`;
        document.getElementById('sift-step-label').textContent =
            step > 0 ? `迭代 ${siftingAnimState.iteration + 1} · 步驟 ${step}/4` : '';
    }

    function siftNextStep() {
        if (!siftingAnimState) initSiftingDemo();
        const s = siftingAnimState;

        s.step++;

        if (s.step > 4) {
            const { result, done } = EMD.siftOnce(s.current);
            if (done) {
                s.step = 4;
                document.getElementById('sift-explanation').textContent = SIFT_EXPLANATIONS[4];
                return;
            }
            s.current = result;
            s.iteration++;
            s.step = 1;
        }

        plotSiftingStep();
        document.getElementById('sift-next').disabled = false;
    }

    function siftAutoPlay() {
        if (!siftingAnimState) initSiftingDemo();
        const s = siftingAnimState;

        if (s.autoPlaying) {
            s.autoPlaying = false;
            document.getElementById('sift-auto').textContent = '自動播放';
            return;
        }

        s.autoPlaying = true;
        document.getElementById('sift-auto').textContent = '暫停';

        const tick = () => {
            if (!s.autoPlaying || s.iteration >= 10) {
                s.autoPlaying = false;
                document.getElementById('sift-auto').textContent = '自動播放';
                return;
            }
            siftNextStep();
            setTimeout(tick, 800);
        };
        tick();
    }

    // -- Sleep stage charts --
    function renderStageCharts() {
        ['wake', 'n1', 'n2', 'n3', 'rem'].forEach(stage => {
            const canvasId = `chart-${stage}`;
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const data = EMD.generateStageSignal(stage, 256);

            if (charts[canvasId]) charts[canvasId].destroy();

            const opts = getChartDefaults();
            opts.aspectRatio = 2;
            opts.scales.x.display = false;
            opts.scales.y.display = false;

            const stageColors = {
                wake: '#f59e0b', n1: '#60a5fa', n2: '#a78bfa', n3: '#34d399', rem: '#f472b6'
            };

            charts[canvasId] = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: data.map((_, i) => i),
                    datasets: [{
                        data,
                        borderColor: stageColors[stage],
                        backgroundColor: stageColors[stage] + '15',
                        fill: true,
                        tension: 0.2
                    }]
                },
                options: opts
            });
        });
    }

    // -- HHT Spectrogram --
    function renderHHT() {
        const stageType = document.getElementById('hht-stage').value;
        const canvas = document.getElementById('chart-hht');
        if (!canvas) return;

        let signal;
        const len = 512;
        switch (stageType) {
            case 'transition':
                signal = [];
                for (let i = 0; i < len; i++) {
                    const t = i / 256;
                    const T = len / 256;
                    const blend = i / len;
                    const wake = 0.8 * Math.sin(2 * Math.PI * 10 * t) + 0.5 * Math.sin(2 * Math.PI * 20 * t);
                    const deep = 1.5 * Math.sin(2 * Math.PI * 1.5 * t) + 0.5 * Math.sin(2 * Math.PI * 3 * t);
                    signal.push(wake * (1 - blend) + deep * blend + 0.08 * (Math.random() * 2 - 1));
                }
                break;
            case 'spindle':
                signal = EMD.generateStageSignal('n2', len);
                break;
            case 'deep':
                signal = EMD.generateStageSignal('n3', len);
                break;
            default:
                signal = EMD.generateSleepEEG(len);
        }

        const result = EMD.decompose(signal, 5, 10);
        const hht = EMD.hilbertTransform(result.imfs, 256);

        const freqBins = 40;
        const timeBins = 64;
        const maxFreq = 30;
        const spectrogram = Array.from({ length: freqBins }, () => new Array(timeBins).fill(0));

        hht.forEach(({ instFreq, instAmp }) => {
            for (let i = 0; i < instFreq.length; i++) {
                const tBin = Math.floor(i / instFreq.length * timeBins);
                const fBin = Math.floor(Math.min(instFreq[i], maxFreq) / maxFreq * (freqBins - 1));
                if (tBin >= 0 && tBin < timeBins && fBin >= 0 && fBin < freqBins) {
                    spectrogram[fBin][tBin] += instAmp[i];
                }
            }
        });

        let maxVal = 0;
        spectrogram.forEach(row => row.forEach(v => { if (v > maxVal) maxVal = v; }));
        if (maxVal === 0) maxVal = 1;

        if (charts['chart-hht']) charts['chart-hht'].destroy();

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        const w = rect.width - 80;
        const h = 300;
        canvas.width = (w + 80) * dpr;
        canvas.height = (h + 50) * dpr;
        canvas.style.width = (w + 80) + 'px';
        canvas.style.height = (h + 50) + 'px';
        ctx.scale(dpr, dpr);

        const style = getComputedStyle(document.documentElement);
        const textColor = style.getPropertyValue('--text-secondary').trim() || '#94a3b8';

        ctx.fillStyle = style.getPropertyValue('--surface').trim() || '#1a2332';
        ctx.fillRect(0, 0, w + 80, h + 50);

        const cellW = w / timeBins;
        const cellH = h / freqBins;

        for (let f = 0; f < freqBins; f++) {
            for (let t = 0; t < timeBins; t++) {
                const val = spectrogram[f][t] / maxVal;
                const r = Math.floor(val * 200 + 20);
                const g = Math.floor(val * 100 + 10);
                const b = Math.floor(255 - val * 150);
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(60 + t * cellW, h - (f + 1) * cellH, cellW + 1, cellH + 1);
            }
        }

        ctx.fillStyle = textColor;
        ctx.font = '11px "Noto Sans TC", sans-serif';
        ctx.textAlign = 'right';
        for (let f = 0; f <= 4; f++) {
            const freq = (f / 4 * maxFreq).toFixed(0);
            const y = h - (f / 4 * h);
            ctx.fillText(freq + ' Hz', 55, y + 4);
        }

        ctx.textAlign = 'center';
        for (let t = 0; t <= 4; t++) {
            const time = (t / 4 * 2).toFixed(1);
            ctx.fillText(time + 's', 60 + (t / 4 * w), h + 16);
        }

        ctx.fillText('Hilbert-Huang 時頻譜', 60 + w / 2, h + 40);
    }

    // -- Theme --
    function initTheme() {
        const saved = localStorage.getItem('emd-theme');
        if (saved) document.documentElement.setAttribute('data-theme', saved);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('emd-theme', next);
        Object.values(charts).forEach(c => {
            if (c && c.destroy) c.destroy();
        });
        Object.keys(charts).forEach(k => delete charts[k]);
        plotOriginalSignal();
        renderStageCharts();
    }

    // -- Nav scroll highlight --
    function initNavHighlight() {
        const links = document.querySelectorAll('.nav-links a');
        const sections = [...links].map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);

        function update() {
            const scrollY = window.scrollY + 100;
            let current = '';
            sections.forEach(s => {
                if (s.offsetTop <= scrollY) current = '#' + s.id;
            });
            links.forEach(a => {
                a.classList.toggle('active', a.getAttribute('href') === current);
            });
        }

        window.addEventListener('scroll', update, { passive: true });
        update();
    }

    // -- Init --
    function init() {
        initTheme();
        initNavHighlight();

        plotOriginalSignal();
        renderStageCharts();

        document.getElementById('run-emd').addEventListener('click', runEMD);
        document.getElementById('step-emd').addEventListener('click', stepEMD);
        document.getElementById('reset-emd').addEventListener('click', resetEMD);

        document.querySelectorAll('#delta-amp, #theta-amp, #alpha-amp, #spindle-amp, #noise-amp').forEach(el => {
            el.addEventListener('input', () => {
                updateSliderLabels();
                plotOriginalSignal();
            });
        });

        document.getElementById('signal-type').addEventListener('change', plotOriginalSignal);
        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

        document.getElementById('sift-start').addEventListener('click', () => {
            initSiftingDemo();
            plotSiftingStep();
        });
        document.getElementById('sift-next').addEventListener('click', siftNextStep);
        document.getElementById('sift-auto').addEventListener('click', siftAutoPlay);

        document.getElementById('run-hht').addEventListener('click', renderHHT);

        renderHHT();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
