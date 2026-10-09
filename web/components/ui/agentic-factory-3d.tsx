'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type StationId = 'receiving' | 'prep' | 'pack' | 'returns' | 'recovery';

export type AgenticFactory3DProps = {
  /** Height of the scene box, e.g. 520, 640 or '100vh'. Default '520px'. */
  height?: number | string;
  className?: string;
  /** Clean hero mode: no panels, the machine on the right of a wide frame. */
  embed?: boolean;
  /** Active selected station ID */
  activeStation?: string | null;
  /** Callback when a station is clicked */
  onStation?: (id: StationId) => void;
  /** The first real frame is drawn */
  onReady?: () => void;
};

export default function AgenticFactory3D({
  height = '520px',
  className,
  embed = false,
  activeStation,
  onStation,
  onReady,
}: AgenticFactory3DProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onStation, onReady });
  useEffect(() => {
    handlers.current = { onStation, onReady };
  }, [onStation, onReady]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;

    document.fonts.ready.then(() => {
      if (cancelled) return;
      dispose = initMachineScene(root, getComputedStyle(root).fontFamily, {
        embedded: embed,
        onStation: (id) => handlers.current.onStation?.(id as StationId),
        onReady: () => handlers.current.onReady?.(),
      });
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [embed]);

  // Focus station if external activeStation changes
  useEffect(() => {
    if (activeStation && typeof window !== 'undefined' && window.__machine) {
      window.__machine.focusStation(activeStation);
    }
  }, [activeStation]);

  return (
    <div
      ref={rootRef}
      className={['agentic-factory-3d', embed && 'embed', className].filter(Boolean).join(' ')}
      style={{ height }}
    >
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div
        id="scene"
        role="img"
        aria-label="Interactive 3D commerce pipeline with five stations: Receiving, Prep, Pack, Returns, and Recovery."
      />
      <div className="vignette" />

      {/* TOP HEADER */}
      <header className="topbar debug-ui">
        <div className="identity">
          <div className="mark">
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 5l7 11 7-11M7 5l3 5 3-5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <strong>Commerce Multi-Agent Pipeline</strong>
            <small>Interactive 3D Machine</small>
          </div>
        </div>
        <div className="status" id="status">
          <i />
          <span id="status-text">Pipeline stream active</span>
          <span>EVIDENCE v1.0</span>
        </div>
      </header>

      <div className="scene-heading debug-ui">
        5 AGENTS / 1 IMMUTABLE CONTRACT <span className="index">INBOUND ➔ DISPUTE</span>
      </div>

      <div id="labels" />
      <div id="tooltip" role="tooltip">
        <strong />
        <p />
      </div>

      {/* CONTROLS (Focused on overview) */}
      <div className="controls debug-ui">
        <nav className="camera-row" aria-label="Camera Controls">
          <span className="caption">PIPELINE VIEW</span>
          <button data-camera="overview" aria-pressed="true">
            Overview
          </button>
          <button data-camera="side" aria-pressed="false">
            Side Angle
          </button>
          <button data-camera="top" aria-pressed="false">
            Top View
          </button>
          <span className="divider" />
          <button id="play" aria-label="Pause animation" aria-pressed="false">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="1" width="2.5" height="10" rx=".5" />
              <rect x="7.5" y="1" width="2.5" height="10" rx=".5" />
            </svg>
          </button>
        </nav>
      </div>

      {/* FOOTER */}
      <footer className="footer">
        <span className="wordmark">
          Pod 5-Agent Architecture · <span>Inbound to Dispute</span>
        </span>
        <span className="hint debug-ui">
          <svg width="13" height="16" viewBox="0 0 13 16" fill="none">
            <rect x="2" y="1" width="9" height="14" rx="4.5" stroke="currentColor" />
            <path d="M6.5 4v3" stroke="currentColor" strokeLinecap="round" />
          </svg>
          Drag to rotate. Scroll to zoom. Click station to inspect.
        </span>
      </footer>

      <div id="loading">
        <i />
        <span>Initializing 3D Pipeline</span>
      </div>
      <div id="error" role="alert">
        <strong>WebGL acceleration required</strong>
        <p>Ensure WebGL is enabled in your browser settings.</p>
        <button onClick={() => location.reload()}>Retry</button>
      </div>
    </div>
  );
}

export type MachineMode = 'assembled' | 'cutaway' | 'stations' | 'order';
export type MachineCamera = 'overview' | 'side' | 'top' | 'station' | 'flight';

export type MachineApi = {
  setMode: (name: string) => boolean;
  focusStation: (id: string) => boolean;
  setCamera: (name: string) => boolean;
  play: () => boolean;
  pause: () => boolean;
};

declare global {
  interface Window {
    __machine?: MachineApi;
    __machineDebug?: { getState: () => Record<string, unknown> };
  }
}

export type MachineSceneOptions = {
  embedded: boolean;
  onStation?: (id: string) => void;
  onReady?: () => void;
};

function initMachineScene(
  root: HTMLElement,
  fontFamily: string,
  options: MachineSceneOptions
): () => void {
  const cleanups: Array<() => void> = [];
  const frameWidth = () => root.clientWidth;
  const frameHeight = () => root.clientHeight;

  const listen = (target: EventTarget, type: string, handler: (event: never) => void) => {
    const fn = handler as unknown as EventListener;
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  };

  function $<T extends HTMLElement = HTMLElement>(id: string): T {
    const el = root.querySelector<T>(`#${id}`);
    if (!el) throw new Error(`Scene markup is missing #${id}`);
    return el;
  }

  function showError(message?: string) {
    const loading = root.querySelector('#loading');
    const err = root.querySelector<HTMLElement>('#error');
    if (loading) loading.classList.add('done');
    if (err) {
      err.style.display = 'block';
      if (message) err.querySelector('p')!.textContent = message;
    }
  }

  try {
    const TAU = Math.PI * 2;
    const embedded = options.embedded;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Palette tailored strictly to the UI: Terracotta #773C30, clean ivory/slate, steel metal
    const palette = {
      terracotta: 0x773C30,
      terracottaLight: 0x994838,
      white: 0xFFFFFF,
      ivory: 0xF8FAFC,
      dark: 0x1E293B,
      slate: 0x334155,
      steel: 0x64748B,
      border: 0xCBD5E1,
      emerald: 0x16A34A,
      amber: 0xD97706,
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, frameWidth() / frameHeight(), 0.1, 150);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      showError('WebGL is not available in your browser.');
      throw e;
    }

    renderer.setClearColor(0x000000, 0); // Pure transparent so it blends seamlessly
    renderer.setPixelRatio(Math.min(devicePixelRatio, frameWidth() < 900 ? 1.5 : 1.75));
    renderer.setSize(frameWidth(), frameHeight());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true;

    $('scene').appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minDistance = 7;
    controls.maxDistance = 55;
    controls.minPolarAngle = 0.09;
    controls.maxPolarAngle = Math.PI * 0.475;
    controls.rotateSpeed = 0.48;
    controls.zoomSpeed = 0.7;

    if (embedded) {
      controls.enableZoom = false;
      if (matchMedia('(pointer:coarse)').matches) controls.enableRotate = false;
    }

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.65;
    room.dispose();
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xF1F5F9, 0xCBD5E1, 2.2));
    const key = new THREE.DirectionalLight(0xFFFFFF, 4.0);
    key.position.set(-4, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -10,
      right: 10,
      top: 9,
      bottom: -9,
      near: 0.5,
      far: 35,
    });
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0002;
    key.shadow.radius = 4;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xE2E8F0, 3.0);
    rim.position.set(3, 7, -8);
    scene.add(rim);

    const warm = new THREE.PointLight(0x773C30, 24, 20, 2);
    warm.position.set(-4, 5, 3);
    scene.add(warm);

    const front = new THREE.DirectionalLight(0xFFFFFF, 1.2);
    front.position.set(5, 3, 10);
    scene.add(front);

    const mat = (
      color: number,
      metalness = 0.1,
      roughness = 0.4,
      extra: THREE.MeshStandardMaterialParameters = {}
    ) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

    const M = {
      body: mat(palette.slate, 0.65, 0.32),
      base: mat(palette.dark, 0.85, 0.3),
      edge: mat(palette.border, 0.8, 0.25),
      chrome: mat(0xE2E8F0, 0.92, 0.18),
      dark: mat(0x0F172A, 0.45, 0.38),
      rubber: mat(0x1E293B, 0.1, 0.6),
      terracotta: mat(palette.terracotta, 0.52, 0.28),
      ivory: mat(palette.ivory, 0.35, 0.3),
      copper: mat(0xC57E45, 0.85, 0.3),
      black: mat(0x0F172A, 0, 0.6),
      light: mat(palette.terracotta, 0.2, 0.25, { emissive: palette.terracotta, emissiveIntensity: 1.6 }),
      whiteLight: mat(0xFFFFFF, 0.1, 0.3, { emissive: 0xFFFFFF, emissiveIntensity: 1.8 }),
      green: mat(palette.emerald, 0.1, 0.3, { emissive: palette.emerald, emissiveIntensity: 1.2 }),
      glass: mat(0x94A3B8, 0.45, 0.16, { transparent: true, opacity: 0.22, depthWrite: false }),
      paper: mat(0xFFFFFF, 0, 0.85),
    };

    type Vec3 = [number, number, number];
    type Material = THREE.Material;
    const geometries = new Map<string, THREE.BufferGeometry>();

    function boxGeo(w: number, h: number, d: number, r = 0.04) {
      const k = `b${w},${h},${d},${r}`;
      if (!geometries.has(k)) {
        geometries.set(
          k,
          r
            ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3))
            : new THREE.BoxGeometry(w, h, d)
        );
      }
      return geometries.get(k)!;
    }

    function box(
      parent: THREE.Object3D,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      m: Material = M.body,
      r = 0.04
    ) {
      const o = new THREE.Mesh(boxGeo(w, h, d, r), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }

    function cyl(
      parent: THREE.Object3D,
      r: number,
      h: number,
      x: number,
      y: number,
      z: number,
      m: Material = M.chrome,
      r2: number = r,
      segments = 24
    ) {
      const k = `c${r},${r2},${h},${segments}`;
      if (!geometries.has(k)) geometries.set(k, new THREE.CylinderGeometry(r, r2, h, segments));
      const o = new THREE.Mesh(geometries.get(k)!, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }

    function ball(
      parent: THREE.Object3D,
      r: number,
      x: number,
      y: number,
      z: number,
      m: Material = M.chrome
    ) {
      const k = `s${r}`;
      if (!geometries.has(k)) geometries.set(k, new THREE.SphereGeometry(r, 12, 8));
      const o = new THREE.Mesh(geometries.get(k)!, m);
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    }

    function tube(parent: THREE.Object3D, pts: Vec3[], r: number, m: Material = M.chrome) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const o = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(12, pts.length * 7), r, 8, false),
        m
      );
      o.castShadow = true;
      parent.add(o);
      return o;
    }

    function screw(parent: THREE.Object3D, x: number, y: number, z: number) {
      cyl(parent, 0.055, 0.026, x, y, z, M.chrome, undefined, 12);
      box(parent, 0.068, 0.005, 0.009, x, y + 0.014, z, M.dark, 0);
    }

    type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
    function canvasTexture(w: number, h: number, draw: Draw) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      draw(ctx, w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      return { texture: t, canvas: c, ctx };
    }

    function print(
      ctx: CanvasRenderingContext2D,
      txt: string,
      x: number,
      y: number,
      size = 20,
      color = '#F8FAFC',
      weight = 600
    ) {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${fontFamily}, system-ui, sans-serif`;
      ctx.fillText(txt, x, y);
    }

    function screenMaterial(texture: THREE.Texture) {
      return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    }

    type Painted = THREE.Texture | { texture: THREE.Texture };
    function screen(
      parent: THREE.Object3D,
      w: number,
      h: number,
      x: number,
      y: number,
      z: number,
      tex: Painted
    ) {
      const map = 'texture' in tex ? tex.texture : tex;
      const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMaterial(map));
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    }

    const machine = new THREE.Group();
    scene.add(machine);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.ShadowMaterial({ opacity: 0.16 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.43;
    floor.receiveShadow = true;
    scene.add(floor);

    const shadow = canvasTexture(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(64, 64, 12, 64, 64, 64);
      g.addColorStop(0, 'rgba(15,23,42,.6)');
      g.addColorStop(0.55, 'rgba(15,23,42,.2)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });

    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 13),
      new THREE.MeshBasicMaterial({
        map: shadow.texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.5,
      })
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -0.415;
    scene.add(contact);

    // Platform base with engraved commerce pipeline nomenclature
    box(machine, 12.8, 0.38, 8.25, 0, -0.09, 0, M.base, 0.17);
    box(machine, 12.6, 0.055, 8.08, 0, 0.13, 0, M.edge, 0.11);
    box(machine, 12.49, 0.09, 7.96, 0, 0.19, 0, M.body, 0.1);
    box(machine, 12.55, 0.027, 8.02, 0, -0.19, 0, M.dark, 0.06);
    box(machine, 11.9, 0.026, 0.032, 0, -0.17, 4.115, M.light, 0.01);

    for (const x of [-5.6, 5.6])
      for (const z of [-3.35, 3.35]) {
        cyl(machine, 0.39, 0.25, x, -0.31, z, M.rubber);
        cyl(machine, 0.29, 0.09, x, -0.4, z, M.dark);
        screw(machine, x, 0.253, z);
      }
    for (const x of [-6.02, 6.02]) for (const z of [-3.73, 3.73]) screw(machine, x, 0.255, z);

    // Platform Engraving
    const engraving = canvasTexture(1536, 176, (c, w, h) => {
      c.fillStyle = '#1E293B';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#475569';
      c.lineWidth = 2;
      c.strokeRect(2, 2, w - 4, h - 4);
      print(c, 'COMMERCE PIPELINE', 45, 79, 38, '#F8FAFC', 700);
      print(c, '· Inbound → Prep → Pack → Returns → Recovery', 510, 79, 32, '#94A3B8', 500);
      print(c, 'EVIDENCE CONTRACT v1.0   /   POD 5-AGENT ORCHESTRATION', 47, 133, 19, '#CBD5E1', 600);
      print(c, 'VERIFIED CHAIN', 1330, 130, 22, '#773C30', 700);
    });

    const plate = screen(machine, 7.35, 0.84, -0.4, 0.25, 3.51, engraving);
    plate.rotation.x = -Math.PI / 2;

    // THE 5 COMMERCE STATIONS
    type StationDef = {
      id: string;
      name: string;
      step: number;
      output: string;
      pos: Vec3;
      desc: string;
    };
    type Station = StationDef & {
      group: THREE.Group;
      base: THREE.Vector3;
      glowMat: THREE.MeshStandardMaterial;
      label: HTMLDivElement;
      index: number;
      anchor: THREE.Vector3;
    };

    const definitions: StationDef[] = [
      {
        id: 'receiving',
        name: 'Receiving',
        step: 1,
        output: 'RCV Record',
        pos: [-4.15, 0.29, -0.65],
        desc: 'Inbound PO verification: carton counts, supplier shortfall & arrival inspection.',
      },
      {
        id: 'prep',
        name: 'Prep (FBA)',
        step: 2,
        output: 'PRP Record',
        pos: [-1.65, 0.29, -2.03],
        desc: 'FBA compliance check: polybag suffocation warnings, FNSKU barcodes & prep rules.',
      },
      {
        id: 'pack',
        name: 'Pack (MFN)',
        step: 3,
        output: 'PCK Record',
        pos: [1.5, 0.29, -2.08],
        desc: 'Pre-seal carton audit: visual verification of items & quantities before carton sealing.',
      },
      {
        id: 'returns',
        name: 'Returns',
        step: 4,
        output: 'RTN Record',
        pos: [4.03, 0.29, 0.12],
        desc: 'Post-sale return inspection: condition grading against original pack/prep baseline.',
      },
      {
        id: 'recovery',
        name: 'Recovery',
        step: 5,
        output: 'RCY Record',
        pos: [0.93, 0.29, 1.85],
        desc: 'Dispute & loss recovery: cross-examines fee reports against all prior evidence records.',
      },
    ];

    const stations: Station[] = [];
    const gears: Array<{ g: THREE.Group; vertical: boolean }> = [];

    function gear(
      parent: THREE.Object3D,
      x: number,
      y: number,
      z: number,
      r = 0.3,
      vertical = false
    ) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      if (vertical) g.rotation.x = Math.PI / 2;
      parent.add(g);
      cyl(g, r, 0.09, 0, 0, 0, M.copper);
      cyl(g, r * 0.66, 0.105, 0, 0, 0, M.dark);
      cyl(g, r * 0.22, 0.14, 0, 0, 0, M.chrome);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const b = box(g, r * 0.26, 0.085, r * 0.2, Math.cos(a) * r, 0, Math.sin(a) * r, M.copper, 0.008);
        b.rotation.y = -a;
      }
      g.userData.moving = true;
      gears.push({ g, vertical });
      return g;
    }

    definitions.forEach((d, i) => {
      const group = new THREE.Group();
      group.position.fromArray(d.pos);
      machine.add(group);
      const glowMat = M.light.clone();
      glowMat.emissiveIntensity = 0.6;

      box(group, 2.05, 0.12, 1.78, 0, 0.03, 0, M.dark, 0.1);
      box(group, 1.97, 0.03, 1.7, 0, 0.12, 0, glowMat, 0.09);
      box(group, 2.03, 0.17, 1.75, 0, 0.215, 0, M.body, 0.1);

      for (const x of [-0.85, 0.85]) for (const z of [-0.7, 0.7]) screw(group, x, 0.311, z);

      gear(group, -0.35, 0.45, 0, 0.27);
      gear(group, 0.22, 0.45, 0.12, 0.21);
      box(group, 0.6, 0.15, 0.36, 0.52, 0.47, -0.33, M.dark);

      for (let j = 0; j < 6; j++)
        box(group, 0.025, 0.16, 0.37, 0.3 + j * 0.08, 0.47, -0.33, M.edge, 0.004);

      tube(
        group,
        [
          [-0.7, 0.4, -0.4],
          [-0.55, 0.48, 0.4],
          [0.35, 0.45, 0.6],
          [0.7, 0.58, 0.23],
        ],
        0.023,
        M.light
      );

      const plaque = canvasTexture(512, 116, (c, w, h) => {
        c.fillStyle = '#0F172A';
        c.fillRect(0, 0, w, h);
        print(c, String(i + 1).padStart(2, '0'), 24, 76, 42, '#773C30', 700);
        print(c, d.name.toUpperCase(), 111, 73, 34, '#F8FAFC', 700);
      });
      screen(group, 1.54, 0.345, 0, 0.27, 0.891, plaque);

      const label = document.createElement('div');
      label.className = 'station-label';
      label.innerHTML = `<div class="stem"></div><div class="label-card"><div class="label-title"><span>${String(i + 1).padStart(2, '0')}</span>${d.name}</div><div class="label-meta">Stage ${d.step} · ${d.output}</div></div>`;
      $('labels').appendChild(label);
      cleanups.push(() => label.remove());

      stations.push({
        ...d,
        group,
        base: new THREE.Vector3(...d.pos),
        glowMat,
        label,
        index: i,
        anchor: new THREE.Vector3(0, 2.5, 0),
      });
    });

    // STATION 1: RECEIVING (Inbound PO Verification)
    const stReceiving = stations[0].group;
    box(stReceiving, 1.74, 0.62, 1.33, 0, 0.65, -0.05, M.ivory, 0.13);
    box(stReceiving, 1.5, 0.1, 1.16, 0, 0.99, -0.04, M.body, 0.025);
    for (const x of [-0.68, 0.68]) {
      cyl(stReceiving, 0.065, 1.73, x, 1.35, -0.18, M.chrome);
      box(stReceiving, 0.22, 1.8, 0.22, x, 1.37, -0.44, M.ivory, 0.035);
    }
    box(stReceiving, 1.82, 0.27, 0.4, 0, 2.28, -0.35, M.terracotta, 0.045);
    box(stReceiving, 1.55, 0.06, 0.06, 0, 2.13, -0.115, M.chrome, 0.01);

    const printhead = new THREE.Group();
    stReceiving.add(printhead);
    printhead.position.set(0, 1.9, -0.08);
    printhead.userData.moving = true;
    box(printhead, 0.45, 0.36, 0.44, 0, 0, 0, M.body, 0.05);
    cyl(printhead, 0.11, 0.13, 0, -0.24, 0.03, M.chrome, 0.04);
    box(printhead, 0.24, 0.045, 0.022, 0, 0.09, 0.23, M.light, 0.01);

    const rcvScreenTex = canvasTexture(384, 640, (c, w, h) => {
      c.fillStyle = '#773C30';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#26050A';
      c.beginPath();
      c.roundRect(25, 40, 334, 130, 14);
      c.fill();
      print(c, 'INBOUND RCV', 42, 85, 26, '#FFFFFF', 700);
      print(c, 'PO MATCH: 100%', 42, 125, 20, '#A3E635', 600);
      c.fillStyle = '#1E293B';
      c.beginPath();
      c.roundRect(25, 195, 334, 395, 14);
      c.fill();
      print(c, 'CARTON AUDIT', 45, 240, 22, '#F8FAFC', 700);
      print(c, 'Shortfall: 0 units', 45, 280, 18, '#CBD5E1', 500);
      print(c, 'Damages: None', 45, 315, 18, '#CBD5E1', 500);
      print(c, 'VERDICT: PASS', 45, 375, 26, '#A3E635', 800);
      print(c, 'Record: RCV-7701', 45, 520, 20, '#FDA4AF', 600);
    });
    const outputVideo = new THREE.Group();
    outputVideo.userData.moving = true;
    stReceiving.add(outputVideo);
    box(outputVideo, 0.62, 1.08, 0.055, 0, 1.36, 0.61, M.dark, 0.035);
    screen(outputVideo, 0.56, 0.98, 0, 1.36, 0.641, rcvScreenTex);

    // STATION 2: PREP (FBA Compliance)
    const stPrep = stations[1].group;
    box(stPrep, 1.9, 0.66, 1.36, 0, 0.67, -0.04, M.body, 0.11);
    const prepConsole = new THREE.Group();
    prepConsole.position.set(0, 1.01, -0.08);
    prepConsole.rotation.x = -0.32;
    stPrep.add(prepConsole);
    box(prepConsole, 1.76, 0.12, 1.27, 0, 0, 0, M.ivory, 0.04);

    const prepScreenTex = canvasTexture(640, 340, (c, w, h) => {
      c.fillStyle = '#0F172A';
      c.fillRect(0, 0, w, h);
      print(c, 'FBA PREP COMPLIANCE', 25, 45, 22, '#CBD5E1', 700);
      print(c, 'STATION 02', 497, 45, 20, '#773C30', 700);
      for (let i = 0; i < 3; i++) {
        const y = 74 + i * 76;
        c.fillStyle = '#1E293B';
        c.beginPath();
        c.roundRect(21, y, 598, 61, 8);
        c.fill();
        c.fillStyle = i === 0 ? '#16A34A' : '#475569';
        c.fillRect(34, y + 10, 27, 41);
        print(c, ['Polybag Sealed', 'Suffocation Warning', 'FNSKU Barcode'][i], 77, y + 29, 19, '#F8FAFC', 600);
        print(c, 'COMPLIANT ✓', 77, y + 49, 12, '#86EFAC', 600);
      }
    });
    const qs = screen(prepConsole, 1.53, 0.79, 0, 0.067, -0.17, prepScreenTex);
    qs.rotation.x = -Math.PI / 2;

    // STATION 3: PACK (Pre-Seal Carton Audit)
    const stPack = stations[2].group;
    box(stPack, 1.35, 0.18, 0.88, 0, 0.44, 0, M.ivory, 0.045);
    cyl(stPack, 0.095, 1.04, 0, 0.93, -0.31, M.chrome);
    box(stPack, 0.56, 0.91, 0.14, 0, 0.99, -0.34, M.body, 0.04);
    box(stPack, 2.42, 1.72, 0.2, 0, 1.94, -0.17, M.ivory, 0.08);
    box(stPack, 2.28, 1.59, 0.1, 0, 1.94, -0.044, M.dark, 0.045);

    const packScreenTex = canvasTexture(896, 592, (c, w, h) => {
      c.fillStyle = '#F8FAFC';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#E2E8F0';
      c.fillRect(0, 0, w, 56);
      print(c, 'PRE-SEAL CARTON AUDIT', 33, 38, 22, '#0F172A', 700);
      c.fillStyle = '#1E293B';
      c.beginPath();
      c.roundRect(32, 85, 832, 470, 12);
      c.fill();
      print(c, 'PACK MANAGER ➔ MFN / 3PL', 60, 140, 28, '#FFFFFF', 700);
      print(c, '• Expected Items vs Observed In Box: MATCH', 60, 200, 22, '#A3E635', 600);
      print(c, '• Extra Unmanifested Items: NONE', 60, 250, 22, '#CBD5E1', 500);
      print(c, '• Seal Approval: AUTHORIZED (PCK-PASS)', 60, 310, 24, '#773C30', 700);
      print(c, 'CERTIFIED BEFORE TAPE SEALING', 60, 480, 16, '#94A3B8', 600);
    });
    screen(stPack, 2.16, 1.43, 0, 1.95, 0.011, packScreenTex);

    // STATION 4: RETURNS (Condition Grading)
    const stReturns = stations[3].group;
    box(stReturns, 1.75, 1.77, 1.02, 0, 1.24, -0.13, M.body, 0.12);
    box(stReturns, 1.58, 0.13, 1.09, 0, 2.16, -0.13, M.terracotta, 0.04);
    box(stReturns, 1.47, 1.38, 0.055, 0, 1.31, 0.405, M.dark, 0.025);

    const returnsScreenTex = canvasTexture(480, 460, (c, w, h) => {
      c.fillStyle = '#0F172A';
      c.fillRect(0, 0, w, h);
      print(c, 'RETURN GRADING', 30, 51, 26, '#F8FAFC', 700);
      print(c, 'Baseline Check: PCK-PASS matched', 30, 81, 15, '#94A3B8');
      ;['Grade A (New)', 'Grade B (Open Box)', 'Grade C (Damaged)'].forEach((n, idx) => {
        const y = 110 + idx * 100;
        c.fillStyle = '#1E293B';
        c.beginPath();
        c.roundRect(22, y, 436, 83, 8);
        c.fill();
        c.fillStyle = idx === 0 ? '#16A34A' : '#773C30';
        c.beginPath();
        c.arc(58, y + 40, 19, 0, TAU);
        c.fill();
        print(c, n, 93, y + 36, 20, '#F8FAFC', 600);
        print(c, 'Disposition: ' + (idx === 0 ? 'RESTOCK' : 'REFURBISH'), 93, y + 60, 14, '#CBD5E1');
      });
    });
    screen(stReturns, 1.31, 1.255, 0, 1.37, 0.44, returnsScreenTex);

    // STATION 5: RECOVERY (Dispute & Loss Recovery)
    const stRecovery = stations[4].group;
    box(stRecovery, 1.91, 0.63, 1.32, 0, 0.65, -0.06, M.ivory, 0.12);
    box(stRecovery, 1.96, 0.19, 1.38, 0, 0.42, -0.04, M.body, 0.04);
    box(stRecovery, 1.02, 0.25, 0.91, -0.33, 1.04, -0.03, M.body, 0.045);
    cyl(stRecovery, 0.06, 0.65, -0.35, 1.6, -0.56, M.chrome);
    box(stRecovery, 1.13, 0.46, 0.19, -0.35, 1.98, -0.56, M.body, 0.045);

    const recoveryScreenTex = canvasTexture(512, 176, (c, w, h) => {
      c.fillStyle = '#0F172A';
      c.fillRect(0, 0, w, h);
      print(c, 'LOSS RECOVERY AUDIT', 22, 44, 22, '#A3E635', 700);
      print(c, 'CLAIM CONTRADICTED', 26, 105, 34, '#FFFFFF', 800);
      print(c, 'Evidence Chain: RCV+PCK+RTN valid', 26, 145, 16, '#94A3B8');
    });
    screen(stRecovery, 1.015, 0.349, -0.35, 1.98, -0.459, recoveryScreenTex);

    // CONVEYOR BELT PIPELINE
    const path = new THREE.CatmullRomCurve3(
      [
        [-3.95, 0.84, 0.65],
        [-3.1, 0.84, -0.12],
        [-1.45, 0.84, -0.79],
        [1.32, 0.84, -0.8],
        [3.3, 0.84, 0.19],
        [3.43, 0.84, 1.21],
        [1.35, 0.84, 2.7],
        [-1.4, 0.84, 2.52],
        [-3.54, 0.84, 1.65],
      ].map((p) => new THREE.Vector3(...p)),
      true,
      'catmullrom',
      0.25
    );

    const belt = new THREE.Group();
    machine.add(belt);
    const frameMesh = new THREE.Mesh(new THREE.TubeGeometry(path, 150, 0.35, 8, true), M.dark);
    frameMesh.scale.y = 0.3;
    frameMesh.position.y = 0.51;
    belt.add(frameMesh);

    const beltCount = 148;
    const beltSlats = new THREE.InstancedMesh(boxGeo(0.135, 0.065, 0.63, 0.012), M.body, beltCount);
    beltSlats.receiveShadow = true;
    belt.add(beltSlats);
    beltSlats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    const pVec = new THREE.Vector3();
    const tVec = new THREE.Vector3();

    function updateBelt(t: number) {
      for (let i = 0; i < beltCount; i++) {
        const u = (i / beltCount + t * 0.012) % 1;
        path.getPointAt(u, pVec);
        path.getTangentAt(u, tVec);
        dummy.position.copy(pVec);
        dummy.rotation.set(0, -Math.atan2(tVec.z, tVec.x), 0);
        dummy.updateMatrix();
        beltSlats.setMatrixAt(i, dummy.matrix);
      }
      beltSlats.instanceMatrix.needsUpdate = true;
    }
    updateBelt(0);

    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 160; i++) {
        path.getPointAt(i / 160, pVec);
        path.getTangentAt(i / 160, tVec);
        pts.push(
          pVec.clone().add(new THREE.Vector3(-tVec.z * 0.36 * side, 0.09, tVec.x * 0.36 * side))
        );
      }
      const railPath = new THREE.CatmullRomCurve3(pts);
      belt.add(new THREE.Mesh(new THREE.TubeGeometry(railPath, 160, 0.028, 6, false), M.chrome));
    }

    // Packet payloads traversing the pipeline
    const packetTex = canvasTexture(256, 352, (c, w, h) => {
      c.fillStyle = '#1E293B';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#773C30';
      c.fillRect(15, 15, 226, 40);
      print(c, 'EVIDENCE', 30, 43, 20, '#FFFFFF', 700);
      c.fillStyle = '#A3E635';
      c.fillRect(30, 75, 40, 6);
      print(c, 'UNIT-0006', 30, 115, 18, '#F8FAFC', 600);
      print(c, 'HASH: 0x9f82b', 30, 150, 14, '#94A3B8');
      print(c, 'VERIFIED ✓', 30, 310, 20, '#A3E635', 700);
    });

    const packets: Array<{
      group: THREE.Group;
      stage: number;
    }> = [];

    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.userData.moving = true;
      machine.add(g);
      box(g, 0.47, 0.71, 0.04, 0, 0, 0, M.ivory, 0.022);
      const s = screen(g, 0.43, 0.665, 0, 0, 0.024, packetTex);
      s.material.side = THREE.DoubleSide;
      packets.push({ group: g, stage: i });
    }

    // Merge static geometry
    function compact(group: THREE.Object3D) {
      for (const child of [...group.children]) if ((child as THREE.Group).isGroup) compact(child);
      const buckets = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
      for (const object of group.children) {
        const child = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material> & {
          isInstancedMesh?: boolean;
        };
        if (
          !child.isMesh ||
          child.isInstancedMesh ||
          child.userData.moving ||
          Array.isArray(child.material)
        )
          continue;
        const key = child.material.uuid;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(child);
      }
      for (const list of buckets.values()) {
        if (list.length < 2) continue;
        const geos = list.map((m) => {
          m.updateMatrix();
          const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          return g.applyMatrix4(m.matrix);
        });
        const merged = mergeGeometries(geos, false) as THREE.BufferGeometry | null;
        for (const geo of geos) geo.dispose();
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, list[0].material);
        mesh.castShadow = list.some((x) => x.castShadow);
        mesh.receiveShadow = list.some((x) => x.receiveShadow);
        for (const m of list) group.remove(m);
        group.add(mesh);
      }
    }

    compact(machine);

    stations.forEach((s) =>
      s.group.traverse((o) => {
        o.userData.station = s.id;
      })
    );
    const pickables = stations.map((s) => s.group);

    let playing = !reduceMotion;
    let simTime = 0;
    let selected: string = 'receiving';
    let hovered: string | null = null;
    let width = frameWidth();
    let height = frameHeight();
    let mobile = width <= 900;
    let lastInteraction = performance.now();
    let dragging = false;
    let wasDragged = false;
    let downX = 0;
    let downY = 0;
    let cameraAnimating = true;
    let visible = true;
    let contextLost = false;

    const desiredPosition = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3(0, 1, 0);
    const viewDirection = new THREE.Vector3(10.5, 10.8, 17).normalize();
    let baseDistance = 25;
    let sized = false;
    let readySent = false;

    function layoutCamera() {
      if (!frameWidth() || !frameHeight()) return;
      const first = !sized;
      sized = true;
      width = frameWidth();
      height = frameHeight();
      mobile = width <= 900;
      renderer.setSize(width, height);
      camera.aspect = width / height;

      camera.setViewOffset(
        width,
        height,
        mobile || !embedded ? 0 : -width * 0.21,
        mobile || embedded ? 0 : height * 0.025,
        width,
        height
      );

      const aspect = width / height;
      const availableWidth = mobile ? 0.91 : Math.min(0.55, aspect > 2 ? 0.54 : 0.57);
      const horizontalFit =
        17.3 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect * availableWidth);
      const verticalFit =
        11.5 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (embedded ? 0.85 : 0.62));
      baseDistance =
        (Math.max(horizontalFit, verticalFit) * (mobile ? 0.97 : 1)) /
        (embedded ? (mobile ? 1.15 : 1.45) : 1);
      controls.maxDistance = Math.max(55, baseDistance * 1.6);
      camera.updateProjectionMatrix();

      setCameraGoal();
      cameraAnimating = true;
      if (first) {
        camera.position.copy(desiredPosition);
        controls.target.copy(desiredTarget);
        controls.update();
        cameraAnimating = false;
      }
    }

    let cameraMode: MachineCamera = 'overview';

    function setCameraGoal() {
      if (cameraMode === 'station') {
        const s = stations.find((s) => s.id === selected) || stations[0];
        desiredTarget.copy(s.group.position).add(new THREE.Vector3(0, 1.25, 0));
        desiredPosition.copy(desiredTarget).addScaledVector(viewDirection, mobile ? 9 : 12);
      } else if (cameraMode === 'side') {
        desiredTarget.set(0, 1, 0);
        desiredPosition.set(13, 5, 20).normalize().multiplyScalar(baseDistance).add(desiredTarget);
      } else if (cameraMode === 'top') {
        desiredTarget.set(0, 1, 0);
        desiredPosition.set(0.01, baseDistance, 0.8).add(desiredTarget);
      } else {
        // OVERVIEW default
        desiredTarget.set(0, 1, 0);
        desiredPosition.copy(viewDirection).multiplyScalar(baseDistance).add(desiredTarget);
      }
    }

    function focusStation(id: string) {
      const s = stations.find((s) => s.id === id);
      if (!s) return false;
      selected = id;
      cameraMode = 'station';
      lastInteraction = performance.now();
      setCameraGoal();
      cameraAnimating = true;
      return true;
    }

    function setCamera(name: string) {
      if (name === 'overview' || name === 'side' || name === 'top') {
        cameraMode = name as MachineCamera;
        lastInteraction = performance.now();
        setCameraGoal();
        cameraAnimating = true;
        root.querySelectorAll<HTMLElement>('[data-camera]').forEach((b) => {
          b.setAttribute('aria-pressed', String(b.dataset.camera === cameraMode));
        });
        return true;
      }
      return false;
    }

    function play() {
      playing = true;
      syncPlayback();
      return true;
    }
    function pause() {
      playing = false;
      syncPlayback();
      return true;
    }

    function syncPlayback() {
      const b = root.querySelector<HTMLElement>('#play');
      if (b) {
        b.setAttribute('aria-pressed', String(!playing));
        b.innerHTML = playing
          ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="2.5" height="10" rx=".5"/><rect x="7.5" y="1" width="2.5" height="10" rx=".5"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1l8 5-8 5z"/></svg>';
      }
    }

    const api: MachineApi = {
      setMode: () => true,
      focusStation,
      setCamera,
      play,
      pause,
    };
    window.__machine = api;
    cleanups.push(() => {
      if (window.__machine === api) delete window.__machine;
    });

    root.querySelectorAll<HTMLElement>('[data-camera]').forEach((b) => {
      listen(b, 'click', () => setCamera(b.dataset.camera ?? 'overview'));
    });

    const playBtn = root.querySelector('#play');
    if (playBtn) {
      listen(playBtn, 'click', () => (playing ? pause() : play()));
    }

    layoutCamera();
    camera.position.copy(desiredPosition);
    controls.target.copy(desiredTarget);
    controls.update();
    cameraAnimating = false;

    listen(window, 'resize', layoutCamera);
    const resizeObserver = new ResizeObserver(() => layoutCamera());
    resizeObserver.observe(root);
    cleanups.push(() => resizeObserver.disconnect());

    controls.addEventListener('start', () => {
      dragging = true;
      cameraAnimating = false;
      lastInteraction = performance.now();
    });
    controls.addEventListener('end', () => {
      dragging = false;
      lastInteraction = performance.now();
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const tooltip = $('tooltip');

    function hitStation(x: number, y: number) {
      pointer.set((x / width) * 2 - 1, (-y / height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, true);
      return hits.length ? stations.find((s) => s.id === hits[0].object.userData.station) : null;
    }

    listen(renderer.domElement, 'pointermove', (e: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (Math.hypot(x - downX, y - downY) > 5) wasDragged = true;
      if (dragging) return;
      const s = hitStation(x, y);
      hovered = s ? (s.id as string) : null;
      renderer.domElement.style.cursor = s ? 'pointer' : 'grab';
      tooltip.classList.toggle('visible', !!s);
      if (s) {
        tooltip.querySelector('strong')!.innerHTML = `<span>${String(s.index + 1).padStart(2, '0')}</span>${s.name}`;
        tooltip.querySelector('p')!.textContent = s.desc;
        tooltip.style.left = Math.min(width - 255, Math.max(10, x + 16)) + 'px';
        tooltip.style.top = Math.max(10, Math.min(height - 95, y - 65)) + 'px';
      }
    });

    listen(renderer.domElement, 'pointerleave', () => {
      hovered = null;
      tooltip.classList.remove('visible');
    });

    listen(renderer.domElement, 'pointerdown', (e: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      downX = e.clientX - rect.left;
      downY = e.clientY - rect.top;
      wasDragged = false;
      tooltip.classList.remove('visible');
    });

    listen(renderer.domElement, 'pointerup', (e: PointerEvent) => {
      if (wasDragged) return;
      const rect = root.getBoundingClientRect();
      const s = hitStation(e.clientX - rect.left, e.clientY - rect.top);
      if (!s) return;
      focusStation(s.id as string);
      options.onStation?.(s.id as StationId);
    });

    let lastFrame = performance.now();
    let rafId = 0;

    function animate(now: number) {
      rafId = requestAnimationFrame(animate);
      const dt = Math.max(0, Math.min((now - lastFrame) / 1000, 0.045));
      lastFrame = now;
      if (!visible || contextLost) return;

      if (playing) {
        simTime += dt;
      }
      const t = simTime;
      const tact = (t * TAU) / 4;
      const smooth = 1 - Math.exp(-dt * 5);

      stations.forEach((s, i) => {
        const pulse = Math.pow(Math.max(0, Math.sin(tact - i * 0.9)), 7);
        s.glowMat.emissiveIntensity = THREE.MathUtils.lerp(
          s.glowMat.emissiveIntensity,
          hovered === s.id || (cameraMode === 'station' && selected === s.id)
            ? 3.2
            : 0.55 + pulse * 0.65,
          smooth
        );
      });

      gears.forEach(({ g, vertical }, i) => {
        if (vertical) g.rotation.z = t * (i % 2 ? -1 : 1) * 1.1;
        else g.rotation.y = t * (i % 2 ? -1 : 1) * 1.1;
      });

      printhead.position.x = Math.sin(tact) * 0.42;
      printhead.position.y = 1.91 + Math.sin(tact * 2) * 0.055;
      outputVideo.position.y = ((t / 4) % 1) * 0.25;

      updateBelt(t);

      // Animate packet payloads along belt
      packets.forEach((packet, idx) => {
        const u = ((t * 0.04 + idx * 0.2) % 1);
        path.getPointAt(u, packet.group.position);
        packet.group.position.y += 0.43;
        packet.group.rotation.set(0, 0.18, 0);
      });

      if (cameraMode === 'station' && cameraAnimating) setCameraGoal();

      if (cameraAnimating && !dragging) {
        const speed = 1 - Math.exp(-dt * 2.5);
        camera.position.lerp(desiredPosition, speed);
        controls.target.lerp(desiredTarget, speed);
        if (
          camera.position.distanceTo(desiredPosition) < 0.015 &&
          controls.target.distanceTo(desiredTarget) < 0.015
        ) {
          cameraAnimating = false;
        }
      }

      controls.autoRotate =
        playing &&
        !reduceMotion &&
        !dragging &&
        !cameraAnimating &&
        cameraMode === 'overview' &&
        now - lastInteraction > 6500;
      controls.autoRotateSpeed = 0.25;
      controls.update(dt);

      renderer.render(scene, camera);

      if (!readySent && sized) {
        readySent = true;
        options.onReady?.();
      }
    }

    rafId = requestAnimationFrame(animate);

    cleanups.push(() => {
      cancelAnimationFrame(rafId);
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    });

    const loading = root.querySelector('#loading');
    if (loading) loading.classList.add('done');
    const err = root.querySelector<HTMLElement>('#error');
    if (err) err.style.display = 'none';

  } catch (error) {
    console.error('Machine failed to start:', error);
    showError();
  }

  return () => {
    for (const fn of cleanups.reverse()) fn();
    cleanups.length = 0;
  };
}

const STYLES = String.raw`
.agentic-factory-3d {
  width: 100%;
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.45);
  box-shadow: 0 10px 32px -4px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 1);
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #0F172A;
  font-size: 13px;
  user-select: none;
}
.agentic-factory-3d * {
  box-sizing: border-box;
}
.agentic-factory-3d #scene {
  position: absolute;
  inset: 0;
  touch-action: none;
  outline: none;
}
.agentic-factory-3d #scene canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.agentic-factory-3d .vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(15, 23, 42, 0.05) 100%);
}
.agentic-factory-3d .topbar {
  position: absolute;
  inset: 20px 24px auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
  z-index: 10;
}
.agentic-factory-3d .identity {
  display: flex;
  gap: 10px;
  align-items: center;
}
.agentic-factory-3d .mark {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: #773C30;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.agentic-factory-3d .identity strong {
  display: block;
  font-weight: 700;
  font-size: 13px;
  color: #0F172A;
}
.agentic-factory-3d .identity small {
  display: block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.8px;
  color: #773C30;
  text-transform: uppercase;
}
.agentic-factory-3d .status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  background: rgba(255, 255, 255, 0.9);
  padding: 6px 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}
.agentic-factory-3d .status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #16A34A;
  box-shadow: 0 0 8px rgba(22, 163, 74, 0.6);
}
.agentic-factory-3d .scene-heading {
  position: absolute;
  top: 72px;
  left: 24px;
  pointer-events: none;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: #64748B;
  text-transform: uppercase;
  z-index: 10;
}
.agentic-factory-3d .controls {
  position: absolute;
  bottom: 22px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 15;
}
.agentic-factory-3d .camera-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.agentic-factory-3d .camera-row .caption {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: #64748B;
  padding: 0 8px 0 4px;
}
.agentic-factory-3d .camera-row button {
  border: 0;
  background: transparent;
  color: #475569;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.agentic-factory-3d .camera-row button:hover {
  background: rgba(241, 245, 249, 0.9);
  color: #0F172A;
}
.agentic-factory-3d .camera-row button[aria-pressed='true'] {
  background: #0F172A;
  color: #FFFFFF;
}
.agentic-factory-3d .camera-row .divider {
  width: 1px;
  height: 14px;
  background: rgba(148, 163, 184, 0.4);
  margin: 0 4px;
}
.agentic-factory-3d .camera-row #play {
  padding: 6px 8px;
  display: grid;
  place-items: center;
}
.agentic-factory-3d .footer {
  position: absolute;
  bottom: 22px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: none;
  z-index: 10;
}
.agentic-factory-3d .wordmark {
  font-size: 11px;
  font-weight: 600;
  color: #64748B;
}
.agentic-factory-3d .wordmark span {
  color: #773C30;
}
.agentic-factory-3d .hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748B;
  font-size: 11px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.85);
  padding: 5px 10px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.35);
}
.agentic-factory-3d #tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 25;
  opacity: 0;
  transition: opacity 0.15s;
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  max-width: 260px;
}
.agentic-factory-3d #tooltip.visible {
  opacity: 1;
}
.agentic-factory-3d #tooltip strong {
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  display: flex;
  align-items: center;
  gap: 6px;
}
.agentic-factory-3d #tooltip strong span {
  color: #773C30;
  font-family: ui-monospace, monospace;
}
.agentic-factory-3d #tooltip p {
  font-size: 11px;
  color: #475569;
  margin: 4px 0 0;
  line-height: 1.5;
}
.agentic-factory-3d #loading {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 10px;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  z-index: 20;
}
.agentic-factory-3d #loading i {
  height: 18px;
  width: 18px;
  border-radius: 50%;
  border: 2px solid rgba(119, 60, 48, 0.2);
  border-top-color: #773C30;
  animation: af3d-spin 1s linear infinite;
}
@keyframes af3d-spin {
  to { transform: rotate(360deg); }
}
.agentic-factory-3d #loading.done {
  opacity: 0;
  pointer-events: none;
}
.agentic-factory-3d #error {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: #FFF1F2;
  padding: 20px;
  border-radius: 14px;
  display: none;
  font-size: 13px;
  color: #991B1B;
  text-align: center;
}
@media (max-width: 768px) {
  .agentic-factory-3d .footer {
    display: none;
  }
}
`;
