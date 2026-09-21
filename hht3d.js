import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const mount = document.getElementById('hht3d-mount');
if (mount) init();

function init() {
    const FS = 128, N = 1024;
    const TB = 72, FB = 48, FMAX = 32;
    const W = 12, D = 8;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060a, 0.045);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(10, 7, 12);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.minDistance = 6;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 0.8, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const key = new THREE.DirectionalLight(0x99eeff, 1.2);
    key.position.set(5, 10, 6);
    scene.add(key);
    const rim = new THREE.PointLight(0xff4fd8, 30, 40);
    rim.position.set(-8, 4, -6);
    scene.add(rim);

    const grid = new THREE.GridHelper(Math.max(W, D) * 1.4, 28, 0x1b2233, 0x121826);
    grid.position.y = -0.01;
    scene.add(grid);

    const geo = new THREE.PlaneGeometry(W, D, TB - 1, FB - 1);
    geo.rotateX(-Math.PI / 2);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide, transparent: true, opacity: 0.96 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x33e1ff, transparent: true, opacity: 0.08 }));
    scene.add(wire);

    const cLo = new THREE.Color(0x16305c), cMid = new THREE.Color(0x33e1ff), cHi = new THREE.Color(0xffffff);
    const tmp = new THREE.Color();
    function colormap(v) {
        if (v < 0.55) tmp.copy(cLo).lerp(cMid, v / 0.55);
        else tmp.copy(cMid).lerp(cHi, (v - 0.55) / 0.45);
        return tmp;
    }

    let target = new Float32Array(TB * FB);
    let current = new Float32Array(TB * FB);
    let dirty = true;

    function makeSignal(kind) {
        const out = new Array(N);
        for (let i = 0; i < N; i++) {
            const tau = i / FS;
            const p = i / N;
            let v;
            if (kind === 'transition') {
                const a = DSP.bands(tau, DSP.STAGES[0]);
                const b = DSP.bands(tau, DSP.STAGES[3]);
                const wake = a.alpha + a.beta + a.theta + a.delta;
                const deep = b.delta + b.theta;
                const s = p * p * (3 - 2 * p);
                v = wake * (1 - s) + deep * s;
            } else if (kind === 'spindle') {
                const b = DSP.bands(tau, DSP.STAGES[2]);
                v = b.delta + b.theta + b.sigma + b.kc;
            } else {
                const b = DSP.bands(tau, DSP.STAGES[4]);
                v = b.theta + b.beta + b.alpha + b.saw + b.delta;
            }
            out[i] = v + 0.08 * DSP.noiseAt(i);
        }
        return out;
    }

    function computeSpectrum(kind) {
        const x = makeSignal(kind);
        const { imfs } = EMD.decompose(x, 6, 10);
        const grid = new Float32Array(TB * FB);
        for (const imf of imfs) {
            const { freq, amp } = DSP.instFreq(imf, FS, 15);
            for (let i = 0; i < N; i++) {
                const tb = Math.min(TB - 1, Math.floor(i / N * TB));
                const f = Math.min(freq[i], FMAX - 0.01);
                const fb = Math.floor(f / FMAX * FB);
                if (fb >= 0 && fb < FB) grid[fb * TB + tb] += amp[i];
            }
        }
        const sm = new Float32Array(TB * FB);
        for (let f = 0; f < FB; f++) for (let t = 0; t < TB; t++) {
            let s = 0, w = 0;
            for (let df = -2; df <= 2; df++) for (let dt = -2; dt <= 2; dt++) {
                const ff = f + df, tt = t + dt;
                if (ff < 0 || ff >= FB || tt < 0 || tt >= TB) continue;
                const k = Math.exp(-(df * df + dt * dt) / 2.2);
                s += grid[ff * TB + tt] * k; w += k;
            }
            sm[f * TB + t] = s / w;
        }
        let mx = 0;
        for (let i = 0; i < sm.length; i++) if (sm[i] > mx) mx = sm[i];
        for (let i = 0; i < sm.length; i++) sm[i] = Math.pow(sm[i] / (mx || 1), 0.7);
        return sm;
    }

    function applyHeights() {
        const pos = geo.attributes.position;
        const col = geo.attributes.color;
        const H = 3.2;
        for (let f = 0; f < FB; f++) for (let t = 0; t < TB; t++) {
            const idx = f * TB + t;
            const v = current[idx];
            pos.setY(idx, v * H);
            const c = colormap(v);
            col.setXYZ(idx, c.r, c.g, c.b);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        geo.computeVertexNormals();
        wire.geometry.dispose();
        wire.geometry = new THREE.WireframeGeometry(geo);
    }

    let first = true;
    function setScene(kind) {
        target = computeSpectrum(kind);
        if (first) { current = Float32Array.from(target); dirty = true; first = false; }
    }

    function resize() {
        const w = mount.clientWidth, h = mount.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 }).observe(mount);

    function frame() {
        requestAnimationFrame(frame);
        if (!visible) return;
        let moving = false;
        for (let i = 0; i < current.length; i++) {
            const d = target[i] - current[i];
            if (Math.abs(d) > 0.002) { current[i] += d * 0.08; moving = true; }
            else current[i] = target[i];
        }
        if (moving || dirty) { applyHeights(); dirty = false; }
        controls.update();
        renderer.render(scene, camera);
    }

    document.querySelectorAll('.hht3d-toolbar .chip').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.hht3d-toolbar .chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setScene(btn.dataset.scene);
        });
    });

    setScene('transition');
    frame();
}
