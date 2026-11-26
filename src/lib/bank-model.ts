// Shows bank.glb exactly like the Bank Model 3D preview: same colours, same lighting,
// and strokes drawn as 2D lines that keep their pixel width and follow the model as it turns.
// Settings (colours, stroke width, lighting, starting view) are read from the .glb itself.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

type Vec3 = [number, number, number];

type ViewerSettings = {
  fill: string;
  stroke: string;
  strokeOn: boolean;
  strokeW: number;
  shading: "flat" | "shaded" | string;
  lightMode: "keep" | string;
  lightI: number;
  shadowS: number;
  bg: string;
  bgTransparent: boolean;
  proj: "persp" | "ortho" | string;
  target: Vec3;
  camera: Vec3;
  modelH: number;
};

/** What the exporter stores in the Bank node's userData.bankViewer. */
type ViewerData = {
  settings?: Partial<ViewerSettings>;
  formA?: string;
  formN?: string;
};

export type BankModelOptions = {
  /** url of bank.glb */
  src?: string;
  /** spin on its own; pauses while dragged and carries on from wherever it's left (default false) */
  autoRotate?: boolean;
  /** seconds for one full auto-rotate turn (default 43); negative spins the other way */
  rotateSeconds?: number;
  /** allow scroll / pinch zoom (default true) */
  zoom?: boolean;
  /** allow right-drag panning (default false) */
  pan?: boolean;
  /** 'transparent', a hex colour, or leave out to use the exported setting */
  background?: string;
  /** degrees from straight above; dragging then only spins the model */
  lockPitch?: number;
  /** starting spin in degrees (0 = front); leave out to use the exported view */
  angle?: number;
  /** camera distance as a multiple of the exported one (0.9 = 10% closer) */
  distance?: number;
  /** show the shadow the model casts on the floor (default true; the model still shades itself when off) */
  floorShadow?: boolean;
  /** CSS touch-action for the canvas; defaults to 'pan-y' when lockPitch is set, so phones can still scroll the page */
  touchAction?: string;
  /** accessible description */
  label?: string;
  /** called once the model is on screen */
  onLoad?: () => void;
};

const V3 = THREE.Vector3;
const CREASE_COS = Math.cos(THREE.MathUtils.degToRad(35));
const DEFAULTS: ViewerSettings = {
  fill: "#FFFFFF",
  stroke: "#FF0000",
  strokeOn: true,
  strokeW: 2,
  shading: "flat",
  lightMode: "keep",
  lightI: 1,
  shadowS: 50,
  bg: "#FFFFFF",
  bgTransparent: true,
  proj: "persp",
  target: [0, 3.9, 0],
  camera: [16.4, 8.6, 20.5],
  modelH: 7.8,
};

// The preview does its colour maths on the colour values exactly as you picked them.
// Passing them through untouched (and leaving the output untouched) reproduces it pixel for pixel.
function raw(hex: string): THREE.Color {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return new THREE.Color().setRGB(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
    THREE.LinearSRGBColorSpace,
  );
}

function floats(b64: string | undefined): Float32Array {
  if (!b64) return new Float32Array(0);
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Float32Array(u.buffer);
}

// Sort every edge of a mesh into a sharp edge (always drawn) or a curved one (drawn when it becomes an outline).
function analyze(
  geo: THREE.BufferGeometry,
  crease: number[],
  cA: number[],
  cN: number[],
): void {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const tris = (idx ? idx.count : pos.count) / 3;
  const ids = new Int32Array(pos.count);
  const map = new Map<string, number>();
  const P: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = Math.round(x * 1e5) + "," + Math.round(y * 1e5) + "," + Math.round(z * 1e5);
    let id = map.get(k);
    if (id === undefined) {
      id = P.length / 3;
      map.set(k, id);
      P.push(x, y, z);
    }
    ids[i] = id;
  }

  type Edge = { u: number; v: number; n: number[] };
  const edges = new Map<number, Edge>();
  const add = (u: number, v: number, nx: number, ny: number, nz: number) => {
    const k = u < v ? u * 1048576 + v : v * 1048576 + u;
    let e = edges.get(k);
    if (!e) {
      e = { u: Math.min(u, v), v: Math.max(u, v), n: [] };
      edges.set(k, e);
    }
    e.n.push(nx, ny, nz);
  };
  const vert = (i: number) => ids[idx ? idx.getX(i) : i];

  for (let t = 0; t < tris; t++) {
    const i0 = vert(3 * t), i1 = vert(3 * t + 1), i2 = vert(3 * t + 2);
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    const ax = P[i1 * 3] - P[i0 * 3], ay = P[i1 * 3 + 1] - P[i0 * 3 + 1], az = P[i1 * 3 + 2] - P[i0 * 3 + 2];
    const bx = P[i2 * 3] - P[i0 * 3], by = P[i2 * 3 + 1] - P[i0 * 3 + 1], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-14) continue;
    nx /= L; ny /= L; nz /= L;
    add(i0, i1, nx, ny, nz);
    add(i1, i2, nx, ny, nz);
    add(i2, i0, nx, ny, nz);
  }

  for (const e of edges.values()) {
    const a = e.u * 3, b = e.v * 3;
    const seg = [P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2]];
    if (e.n.length !== 6) {
      crease.push(...seg);
      continue;
    }
    const d = e.n[0] * e.n[3] + e.n[1] * e.n[4] + e.n[2] * e.n[5];
    if (d < CREASE_COS) crease.push(...seg);
    else if (d < 0.99999) {
      cA.push(...seg);
      cN.push(...e.n);
    }
  }
}

/**
 * Mount the bank model into a container element (give it a size with CSS).
 * @returns call to remove the model and free its memory
 */
export function mountBankModel(
  container: HTMLElement,
  options: BankModelOptions = {},
): () => void {
  const {
    src,
    autoRotate = false,
    rotateSeconds = 43,
    zoom = true,
    pan = false,
    background,
    lockPitch,
    angle,
    distance = 1,
    floorShadow = true,
    touchAction,
    label = "3D bank building. Drag to rotate.",
    onLoad,
  } = options;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { display: "block", width: "100%", height: "100%" });
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  container.appendChild(canvas);

  type Ready = { resize(): void; frame(): void; dispose(): void };
  const scene = new THREE.Scene();
  let disposed = false;
  let raf = 0;
  let ready: Ready | null = null;
  let visible = true;
  const ro = new ResizeObserver(() => ready && ready.resize());
  ro.observe(container);
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  });
  io.observe(container);

  if (src) {
    new GLTFLoader().load(
      src,
      (gltf) => {
        if (disposed) return;
        const r = setup(gltf.scene);
        ready = r;
        r.resize();
        if (onLoad) onLoad();
        const loop = () => {
          raf = requestAnimationFrame(loop);
          if (visible) r.frame();
        };
        loop();
      },
      undefined,
      (err) => console.error("[bank-model] Could not load " + src, err),
    );
  } else {
    console.error("[bank-model] No src given.");
  }

  function setup(root: THREE.Object3D): Ready {
    scene.add(root);
    root.updateMatrixWorld(true);
    const bank = root.getObjectByName("Bank") || root;
    const data = bank.userData?.bankViewer as ViewerData | undefined;
    if (!data) {
      console.warn(
        '[bank-model] This .glb has no viewer settings. Export it again from Bank Model 3D with "Website kit" on.',
      );
    }
    const S: ViewerSettings = { ...DEFAULTS, ...data?.settings };
    const k = 1 / S.modelH; // the file is scaled to 1 unit tall

    // the tube strokes and outline shell are there for other viewers; here the strokes are drawn as 2D lines instead
    for (const name of ["Strokes", "Outline_Shell"]) {
      const o = root.getObjectByName(name) as THREE.Mesh | undefined;
      if (o) {
        o.removeFromParent();
        o.geometry?.dispose();
      }
    }

    // fill
    const offset = { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 };
    const keepU = { value: S.lightMode === "keep" ? 1 : 0 };
    const mat: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial =
      S.shading === "flat"
        ? new THREE.MeshBasicMaterial(offset)
        : new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...offset });
    mat.color.copy(raw(S.fill));
    if (!(mat instanceof THREE.MeshBasicMaterial)) {
      // "Keep fill colour": light can darken the fill but never brighten it past the colour you picked
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uKeep = keepU;
        const chunk = sh.fragmentShader.includes("#include <opaque_fragment>")
          ? "#include <opaque_fragment>"
          : "#include <output_fragment>";
        sh.fragmentShader =
          "uniform float uKeep;\n" +
          sh.fragmentShader.replace(
            chunk,
            "outgoingLight = mix(outgoingLight, min(outgoingLight, diffuseColor.rgb), uKeep);\n" + chunk,
          );
      };
    }
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    for (const m of meshes) {
      const old = m.material;
      (Array.isArray(old) ? old : [old]).forEach((x) => x?.dispose());
      m.material = mat;
      m.castShadow = true;
      m.receiveShadow = true;
    }

    // lighting, matching the preview (three.js now measures light π times weaker, hence the PI)
    const PI = Math.PI;
    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    hemi.color.copy(raw("#FFFFFF"));
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.color.copy(raw("#FFFFFF"));
    sun.position.set(7, 18, 13).multiplyScalar(k);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -10 * k,
      right: 10 * k,
      top: 10 * k,
      bottom: -10 * k,
      near: 1 * k,
      far: 50 * k,
    });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02 * k;
    scene.add(sun);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.13 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80 * k, 80 * k), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.visible = floorShadow && S.shading === "shaded";
    scene.add(ground);
    const s = S.shadowS / 100;
    hemi.groundColor
      .setRGB(1, 1, 1, THREE.LinearSRGBColorSpace)
      .lerp(raw("#D6D1CB"), Math.min(1, s * 2));
    if (S.lightMode === "keep") {
      hemi.intensity = (1 - 0.7 * s) * PI;
      sun.intensity = (0.35 + 0.7 * s) * PI;
      groundMat.opacity = 0.3 * s;
    } else {
      const I = S.lightI;
      sun.intensity = I * 1.1 * s * PI;
      hemi.intensity = I * (1.45 - 1.1 * s) * PI;
      groundMat.opacity = 0.3 * s * Math.min(1, I);
    }

    // background
    const bg = background === undefined ? (S.bgTransparent ? "transparent" : S.bg) : background;
    scene.background = bg === "transparent" ? null : raw(bg);

    // strokes
    const lineMat = new LineMaterial({ linewidth: S.strokeW });
    lineMat.color.copy(raw(S.stroke));
    const crease: number[] = [], cA: number[] = [], cN: number[] = [];
    for (const m of meshes) {
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      analyze(g, crease, cA, cN);
      g.dispose();
    }
    const contourA = new Float32Array(cA);
    const contourN = new Float32Array(cN);
    const formA = floats(data?.formA);
    const formN = floats(data?.formN);
    for (let i = 0; i < formA.length; i += 3) {
      // form lines are stored in model units
      const p = new V3(formA[i], formA[i + 1], formA[i + 2]).applyMatrix4(bank.matrixWorld);
      formA[i] = p.x; formA[i + 1] = p.y; formA[i + 2] = p.z;
    }
    const strokesOn = S.strokeOn !== false;
    const fixedLines = new LineSegments2(
      new LineSegmentsGeometry().setPositions(crease.length ? crease : [0, 0, 0, 0, 0, 0]),
      lineMat,
    );
    fixedLines.frustumCulled = false;
    if (!crease.length) fixedLines.geometry.instanceCount = 0;
    const viewLines = new LineSegments2(
      new LineSegmentsGeometry().setPositions(
        new Float32Array(Math.max(6, contourA.length + formA.length)),
      ),
      lineMat,
    );
    viewLines.frustumCulled = false;
    fixedLines.visible = viewLines.visible = strokesOn;
    scene.add(fixedLines, viewLines);

    // cameras
    const target = new V3().fromArray(S.target).multiplyScalar(k);
    const D0 = 27 * k;
    const ORTHO_H = D0 * Math.tan(THREE.MathUtils.degToRad(15));
    const persp = new THREE.PerspectiveCamera(30, 1, 0.1 * k, 400 * k);
    const view = new THREE.Spherical().setFromVector3(new V3().fromArray(S.camera).multiplyScalar(k));
    view.radius *= distance;
    if (lockPitch !== undefined) view.phi = THREE.MathUtils.degToRad(lockPitch);
    if (angle !== undefined) view.theta = THREE.MathUtils.degToRad(angle);
    persp.position.setFromSpherical(view).add(target);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -200 * k, 400 * k);
    const controls = new OrbitControls(persp, canvas);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 8 * k;
    controls.maxDistance = 90 * k;
    controls.enableZoom = zoom;
    controls.enablePan = pan;
    controls.autoRotate = autoRotate;
    // OrbitControls turns once every 60 / autoRotateSpeed seconds when given the frame time
    controls.autoRotateSpeed = 60 / rotateSeconds;
    // grab hand on hover, closed hand while dragging (OrbitControls otherwise forces cursor: auto on the canvas)
    controls.cursorStyle = "grab";
    if (lockPitch !== undefined) controls.minPolarAngle = controls.maxPolarAngle = view.phi;
    // after OrbitControls, which sets its own
    canvas.style.touchAction = touchAction || (lockPitch !== undefined ? "pan-y" : "none");
    controls.update();

    const activeCam = (): THREE.Camera => {
      if (S.proj !== "ortho") return persp;
      ortho.position.copy(persp.position);
      ortho.quaternion.copy(persp.quaternion);
      ortho.zoom = D0 / persp.position.distanceTo(controls.target);
      ortho.updateProjectionMatrix();
      return ortho;
    };

    // outlines and rounded-edge lines depend on where you look from, so they are recomputed when the view changes
    let viewKey = "";
    let lastFrame = 0;
    const dir = new V3();
    const viewStart = viewLines.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    function updateViewLines(cam: THREE.Camera) {
      const key = S.proj + cam.matrixWorld.elements.map((v) => v.toFixed(4)).join();
      if (key === viewKey) return;
      viewKey = key;
      const out = viewStart.data.array as Float32Array;
      const isOrtho = S.proj === "ortho";
      let dx = 0, dy = 0, dz = 0;
      if (isOrtho) {
        cam.getWorldDirection(dir);
        dx = -dir.x; dy = -dir.y; dz = -dir.z;
      }
      const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      let o = 0;
      for (let i = 0; i < contourA.length; i += 6) {
        let vx = dx, vy = dy, vz = dz;
        if (!isOrtho) {
          vx = cx - (contourA[i] + contourA[i + 3]) / 2;
          vy = cy - (contourA[i + 1] + contourA[i + 4]) / 2;
          vz = cz - (contourA[i + 2] + contourA[i + 5]) / 2;
        }
        const s1 = contourN[i] * vx + contourN[i + 1] * vy + contourN[i + 2] * vz;
        const s2 = contourN[i + 3] * vx + contourN[i + 4] * vy + contourN[i + 5] * vz;
        if (s1 > 0 !== s2 > 0) for (let j = 0; j < 6; j++) out[o++] = contourA[i + j];
      }
      for (let i = 0; i < formA.length; i += 6) {
        let vx = dx, vy = dy, vz = dz;
        if (!isOrtho) {
          vx = cx - (formA[i] + formA[i + 3]) / 2;
          vy = cy - (formA[i + 1] + formA[i + 4]) / 2;
          vz = cz - (formA[i + 2] + formA[i + 5]) / 2;
          const L = Math.hypot(vx, vy, vz) || 1;
          vx /= L; vy /= L; vz /= L;
        }
        const s1 = formN[i] * vx + formN[i + 1] * vy + formN[i + 2] * vz;
        const s2 = formN[i + 3] * vx + formN[i + 4] * vy + formN[i + 5] * vz;
        if (s1 > 0.12 && s2 > 0.12) for (let j = 0; j < 6; j++) out[o++] = formA[i + j];
      }
      viewStart.data.needsUpdate = true;
      viewLines.geometry.instanceCount = o / 6;
    }

    return {
      resize() {
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        renderer.setSize(w, h, false);
        persp.aspect = w / h;
        persp.updateProjectionMatrix();
        const a = w / h;
        Object.assign(ortho, { left: -ORTHO_H * a, right: ORTHO_H * a, top: ORTHO_H, bottom: -ORTHO_H });
        ortho.updateProjectionMatrix();
        lineMat.resolution.set(w, h);
      },
      frame() {
        // real seconds since the last drawn frame, so the spin speed doesn't depend on the screen's refresh rate;
        // capped so it doesn't jump after being scrolled off screen or in a background tab
        const now = performance.now();
        const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
        lastFrame = now;
        controls.update(dt);
        const cam = activeCam();
        if (strokesOn) updateViewLines(cam);
        renderer.render(scene, cam);
      },
      dispose() {
        controls.dispose();
        lineMat.dispose();
        mat.dispose();
        groundMat.dispose();
      },
    };
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    if (ready) ready.dispose();
    scene.traverse((o) => {
      (o as THREE.Mesh).geometry?.dispose();
    });
    renderer.dispose();
    canvas.remove();
  };
}
