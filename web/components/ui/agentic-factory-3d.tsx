'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  /** Clean hero mode */
  embed?: boolean;
  /** Active selected station ID */
  activeStation?: string | null;
  /** Callback when a station is clicked */
  onStation?: (id: StationId) => void;
  /** Callback when the full pipeline run completes */
  onPipelineComplete?: () => void;
  /** The first real frame is drawn */
  onReady?: () => void;
};

export default function AgenticFactory3D({
  height = '520px',
  className,
  embed = false,
  activeStation,
  onStation,
  onPipelineComplete,
  onReady,
}: AgenticFactory3DProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onStation, onPipelineComplete, onReady });
  const [pipelineState, setPipelineState] = useState<'running' | 'completed'>('running');
  const [activeStageName, setActiveStageName] = useState<string>('Receiving');

  useEffect(() => {
    handlers.current = { onStation, onPipelineComplete, onReady };
  }, [onStation, onPipelineComplete, onReady]);

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
        onStageChange: (name) => setActiveStageName(name),
        onComplete: () => {
          setPipelineState('completed');
          handlers.current.onPipelineComplete?.();
        },
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

  const handleRestart = () => {
    if (typeof window !== 'undefined' && window.__machine) {
      window.__machine.replayPipeline();
      setPipelineState('running');
    }
  };

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

      {/* Floating Status / Integration Badge */}
      <div className="pipeline-floating-banner debug-ui">
        {pipelineState === 'completed' ? (
          <div className="complete-badge animate-fade-in">
            <span className="badge-icon">✓</span>
            <div>
              <strong>Complete Integration</strong>
              <small>All 5 agent invariants verified across the workflow</small>
            </div>
            <button
              type="button"
              onClick={handleRestart}
              className="replay-btn"
            >
              Replay Trace
            </button>
          </div>
        ) : (
          <div className="live-badge">
            <span className="live-dot" />
            <div>
              <strong>Sequential Pipeline Active</strong>
              <small>Current Station: {activeStageName}</small>
            </div>
          </div>
        )}
      </div>

      <div id="tooltip" role="tooltip">
        <strong />
        <p />
      </div>

      {/* BACKGROUNDLESS MINIMAL CONTROLS (Overview focused) */}
      <div className="controls debug-ui">
        <nav className="camera-row" aria-label="Camera Controls">
          <span className="caption">VIEW</span>
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

      {/* BACKGROUNDLESS MINIMAL INSTRUCTIONS */}
      <footer className="footer">
        <span className="hint debug-ui">
          <svg width="13" height="16" viewBox="0 0 13 16" fill="none">
            <rect x="2" y="1" width="9" height="14" rx="4.5" stroke="currentColor" />
            <path d="M6.5 4v3" stroke="currentColor" strokeLinecap="round" />
          </svg>
          Drag to rotate • Scroll to zoom • Click any station to inspect
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

export type MachineCamera = 'overview' | 'side' | 'top' | 'station';

export type MachineApi = {
  setMode: (name: string) => boolean;
  focusStation: (id: string) => boolean;
  setCamera: (name: string) => boolean;
  replayPipeline: () => void;
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
  onStageChange?: (name: string) => void;
  onComplete?: () => void;
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
      green: mat(palette.emerald, 0.1, 0.3, { emissive: palette.emerald, emissiveIntensity: 1.5 }),
      glass: mat(0x94A3B8, 0.45, 0.16, { transparent: true, opacity: 0.22, depthWrite: false }),
      paper: mat(0xFFFFFF, 0, 0.85),
      // Specialized realistic domain materials
      cardboard: mat(0xC49A6C, 0.02, 0.82), // Authentic Kraft Cardboard Box
      cardboardDark: mat(0xA87D50, 0.02, 0.85),
      wood: mat(0x9E7044, 0.02, 0.78), // Pallet wood planks
      woodDark: mat(0x7C5632, 0.02, 0.8),
      hazard: mat(0xF59E0B, 0.2, 0.4), // Industrial yellow scanner arch
      tapeRed: mat(0xDC2626, 0.3, 0.35), // Red handheld packing tape dispenser
      tapeRoll: mat(0xD97706, 0.1, 0.5), // Tan packing tape roll
      gold: mat(0xD4AF37, 0.92, 0.2), // Brass balance scale of justice
      brass: mat(0xEAB308, 0.88, 0.25),
      binGreen: mat(0x16A34A, 0.2, 0.4), // Grade A Restock bin
      binAmber: mat(0xD97706, 0.2, 0.4), // Grade B Refurbish bin
      binRed: mat(0xE11D48, 0.2, 0.4), // Grade C Liquidate bin
      vestOrange: mat(0xEA580C, 0.05, 0.55), // Worker safety vest
      skin: mat(0xFBCFE8, 0.02, 0.6), // Stylized worker face/hands
      productBlue: mat(0x2563EB, 0.2, 0.3), // Product bottle
      productYellow: mat(0xFACC15, 0.1, 0.4), // Product carton
      laserGreen: new THREE.MeshBasicMaterial({
        color: 0x22C55E,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      }),
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
    box(machine, 15.6, 0.38, 8.2, 0, -0.09, 0, M.base, 0.17);
    box(machine, 15.4, 0.055, 8.0, 0, 0.13, 0, M.edge, 0.11);
    box(machine, 15.3, 0.09, 7.88, 0, 0.19, 0, M.body, 0.1);
    box(machine, 15.35, 0.027, 7.94, 0, -0.19, 0, M.dark, 0.06);

    for (const x of [-7.0, 7.0])
      for (const z of [-3.5, 3.5]) {
        cyl(machine, 0.39, 0.25, x, -0.31, z, M.rubber);
        cyl(machine, 0.29, 0.09, x, -0.4, z, M.dark);
        screw(machine, x, 0.253, z);
      }
    for (const x of [-7.3, 7.3]) for (const z of [-3.7, 3.7]) screw(machine, x, 0.255, z);

    // Platform Engraving
    const engraving = canvasTexture(1536, 176, (c, w, h) => {
      c.fillStyle = '#1E293B';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#475569';
      c.lineWidth = 2;
      c.strokeRect(2, 2, w - 4, h - 4);
      print(c, 'COMMERCE PIPELINE WORKFLOW', 45, 79, 36, '#F8FAFC', 700);
      print(c, '· 1. Receiving ➔ 2. Prep ➔ 3. Pack ➔ 4. Returns ➔ 5. Recovery', 630, 79, 28, '#94A3B8', 500);
      print(c, 'EVIDENCE CONTRACT v1.0   /   IMMUTABLE MULTI-AGENT HANDOFFS', 47, 133, 19, '#CBD5E1', 600);
      print(c, 'VERIFIED AUDIT TRACE', 1280, 130, 22, '#22C55E', 700);
    });

    const plate = screen(machine, 9.8, 0.84, 0, 0.25, 3.55, engraving);
    plate.rotation.x = -Math.PI / 2;

    // THE 5 COMMERCE STATIONS IN STRICT SEQUENTIAL ORDER (Left to Right)
    type StationDef = {
      id: StationId;
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
      index: number;
    };

    const definitions: StationDef[] = [
      {
        id: 'receiving',
        name: 'Receiving Dock',
        step: 1,
        output: 'RCV Record',
        pos: [-5.2, 0.29, -0.45],
        desc: 'Inbound PO verification: pallet ingest, carton barcode scan & supplier baseline.',
      },
      {
        id: 'prep',
        name: 'Prep (FBA)',
        step: 2,
        output: 'PRP Record',
        pos: [-2.6, 0.29, -0.45],
        desc: 'FBA compliance check: operator arranging polybag suffocation warnings & FNSKU barcodes.',
      },
      {
        id: 'pack',
        name: 'Pack (MFN)',
        step: 3,
        output: 'PCK Record',
        pos: [0.0, 0.29, -0.45],
        desc: 'Pre-seal carton audit: 3D cardboard box packing, items in box & overhead visual certification.',
      },
      {
        id: 'returns',
        name: 'Returns Triage',
        step: 4,
        output: 'RTN Record',
        pos: [2.6, 0.29, -0.45],
        desc: 'Post-sale return inspection: RMA scan & condition sorting into Grade A/B/C bins.',
      },
      {
        id: 'recovery',
        name: 'Recovery Audit',
        step: 5,
        output: 'RCY Record',
        pos: [5.2, 0.29, -0.45],
        desc: 'Channel loss recovery: financial dispute desk with balance scale & fee reconciliation ledger.',
      },
    ];

    const stations: Station[] = [];
    const gears: Array<{ g: THREE.Group; vertical: boolean }> = [];

    definitions.forEach((d, i) => {
      const group = new THREE.Group();
      group.position.fromArray(d.pos);
      machine.add(group);
      const glowMat = M.light.clone();
      glowMat.emissiveIntensity = 0.5;

      // Station Base Pedestal
      box(group, 2.3, 0.12, 2.1, 0, 0.03, 0, M.dark, 0.08);
      box(group, 2.22, 0.03, 2.02, 0, 0.12, 0, glowMat, 0.06);
      box(group, 2.28, 0.17, 2.06, 0, 0.215, 0, M.body, 0.08);

      for (const x of [-0.95, 0.95]) for (const z of [-0.85, 0.85]) screw(group, x, 0.311, z);

      // Station Identification Sign
      const plaque = canvasTexture(512, 116, (c, w, h) => {
        c.fillStyle = '#0F172A';
        c.fillRect(0, 0, w, h);
        print(c, String(i + 1).padStart(2, '0'), 24, 76, 42, '#22C55E', 700);
        print(c, d.name.toUpperCase(), 111, 73, 30, '#F8FAFC', 700);
      });
      screen(group, 1.8, 0.345, 0, 0.27, 1.04, plaque);

      stations.push({
        ...d,
        group,
        base: new THREE.Vector3(...d.pos),
        glowMat,
        index: i,
      });
    });

    // =========================================================================
    // STATION 1: INBOUND RECEIVING DOCK (Pallet, Cartons, Overhead Scanner Gate)
    // =========================================================================
    const stReceiving = stations[0].group;
    // Wooden Pallet Base
    for (const x of [-0.8, 0, 0.8]) {
      box(stReceiving, 0.14, 0.14, 1.8, x, 0.37, -0.05, M.woodDark);
    }
    for (let z = -0.85; z <= 0.75; z += 0.27) {
      box(stReceiving, 1.9, 0.04, 0.22, 0, 0.46, z, M.wood, 0.01);
    }
    // Stacked 3D Cardboard Boxes on Pallet
    box(stReceiving, 0.85, 0.62, 0.75, -0.38, 0.79, -0.2, M.cardboard, 0.02);
    box(stReceiving, 0.68, 0.52, 0.65, 0.42, 0.74, 0.15, M.cardboardDark, 0.02);
    box(stReceiving, 0.58, 0.46, 0.58, -0.22, 1.33, -0.15, M.cardboard, 0.02);
    // Shipping Barcode stickers on cartons
    box(stReceiving, 0.28, 0.18, 0.01, -0.38, 0.82, 0.18, M.paper);
    box(stReceiving, 0.26, 0.16, 0.01, 0.42, 0.76, 0.48, M.paper);

    // Industrial Overhead Scanner Arch (Hazard Yellow / Black)
    const scannerArch = new THREE.Group();
    scannerArch.position.set(0, 0, 0.85); // Right over the conveyor line
    stReceiving.add(scannerArch);
    box(scannerArch, 0.22, 2.7, 0.24, -1.15, 1.35, 0, M.hazard, 0.03);
    box(scannerArch, 0.22, 2.7, 0.24, 1.15, 1.35, 0, M.hazard, 0.03);
    box(scannerArch, 2.52, 0.38, 0.32, 0, 2.65, 0, M.hazard, 0.04);
    // Scanner optics head
    box(scannerArch, 0.85, 0.22, 0.38, 0, 2.38, 0, M.dark, 0.03);
    cyl(scannerArch, 0.11, 0.06, -0.25, 2.25, 0, M.chrome);
    cyl(scannerArch, 0.11, 0.06, 0.25, 2.25, 0, M.chrome);
    // Downward green laser scanner beam plane
    const laserBeam = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.5), M.laserGreen);
    laserBeam.position.set(0, 1.5, 0);
    laserBeam.rotation.x = Math.PI / 12;
    scannerArch.add(laserBeam);

    // Digital Inspection Monitor
    const rcvScreenTex = canvasTexture(400, 300, (c, w, h) => {
      c.fillStyle = '#0F172A';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#16A34A';
      c.fillRect(15, 15, w - 30, 42);
      print(c, '01 RECEIVING DOCK', 30, 43, 20, '#FFFFFF', 700);
      print(c, 'PO MATCH: 100% VERIFIED', 30, 105, 20, '#22C55E', 700);
      print(c, 'Cartons: 12 Expected / 12 Ingested', 30, 145, 16, '#E2E8F0', 500);
      print(c, 'Shortfall: 0 units', 30, 180, 16, '#94A3B8', 500);
      print(c, 'Damage: None (Baseline Established)', 30, 215, 16, '#94A3B8', 500);
      print(c, 'RECORD: RCV-BASELINE-OK', 30, 265, 18, '#86EFAC', 700);
    });
    screen(stReceiving, 1.25, 0.92, 0, 1.55, -0.92, rcvScreenTex);

    // =========================================================================
    // STATION 2: PREP (FBA Compliance, Character arranging items, Polybags)
    // =========================================================================
    const stPrep = stations[1].group;
    // Workbench Table
    box(stPrep, 2.1, 0.1, 1.6, 0, 0.85, -0.05, M.body, 0.03);
    for (const x of [-0.92, 0.92]) for (const z of [-0.75, 0.65]) cyl(stPrep, 0.05, 0.85, x, 0.425, z, M.chrome);

    // 3D Stylized Worker Character Arranging Goods
    const worker = new THREE.Group();
    worker.position.set(0, 0, -0.72);
    stPrep.add(worker);
    // Worker legs
    box(worker, 0.19, 0.72, 0.19, -0.16, 0.36, 0, M.dark);
    box(worker, 0.19, 0.72, 0.19, 0.16, 0.36, 0, M.dark);
    // Torso with orange high-vis safety vest
    box(worker, 0.52, 0.64, 0.3, 0, 1.04, 0, M.vestOrange, 0.05);
    // Silver reflective safety stripes
    box(worker, 0.54, 0.07, 0.32, 0, 1.08, 0, M.chrome);
    box(worker, 0.07, 0.45, 0.32, -0.15, 1.08, 0, M.chrome);
    box(worker, 0.07, 0.45, 0.32, 0.15, 1.08, 0, M.chrome);
    // Head with work cap
    box(worker, 0.27, 0.27, 0.27, 0, 1.48, 0, M.skin, 0.04);
    box(worker, 0.32, 0.09, 0.36, 0, 1.62, 0.04, M.dark, 0.02);
    // Arms reaching down forward to arrange items on table
    box(worker, 0.12, 0.45, 0.12, -0.32, 1.05, 0.22, M.vestOrange, 0.02);
    box(worker, 0.12, 0.45, 0.12, 0.32, 1.05, 0.22, M.vestOrange, 0.02);
    box(worker, 0.1, 0.1, 0.1, -0.32, 0.86, 0.42, M.skin);
    box(worker, 0.1, 0.1, 0.1, 0.32, 0.86, 0.42, M.skin);

    // Prep Items on Table: Clear Polybags & FNSKU Barcodes
    box(stPrep, 0.45, 0.06, 0.4, -0.42, 0.93, 0.15, M.chrome, 0.01);
    box(stPrep, 0.38, 0.05, 0.32, 0.38, 0.93, 0.12, M.cardboard, 0.01);
    cyl(stPrep, 0.14, 0.18, -0.58, 0.99, -0.35, M.tapeRoll); // FNSKU barcode roll
    cyl(stPrep, 0.03, 0.25, 0.55, 1.02, -0.3, M.chrome); // Barcode scanner stand

    // Desktop Monitor on Swivel Arm
    const prepMonitor = new THREE.Group();
    prepMonitor.position.set(0.48, 0.9, -0.5);
    stPrep.add(prepMonitor);
    cyl(prepMonitor, 0.14, 0.03, 0, 0.02, 0, M.dark);
    cyl(prepMonitor, 0.03, 0.45, 0, 0.24, 0, M.chrome);
    box(prepMonitor, 0.85, 0.55, 0.05, 0, 0.48, 0, M.dark, 0.03);
    const prepScreenTex = canvasTexture(380, 240, (c, w, h) => {
      c.fillStyle = '#0F172A';
      c.fillRect(0, 0, w, h);
      print(c, '02 FBA PREP COMPLIANCE', 20, 36, 18, '#22C55E', 700);
      print(c, '• Polybag Sealing: PASS ✓', 20, 80, 16, '#F8FAFC', 600);
      print(c, '• Suffocation Warning: 100% VISIBLE', 20, 120, 15, '#E2E8F0', 500);
      print(c, '• FNSKU Barcode: SCANNED', 20, 160, 15, '#E2E8F0', 500);
      print(c, 'STATUS: AMAZON FBA READY', 20, 205, 17, '#86EFAC', 700);
    });
    screen(prepMonitor, 0.8, 0.5, 0, 0.48, 0.028, prepScreenTex);

    // =========================================================================
    // STATION 3: PRE-SEAL PACK (3D Cardboard Box with Open Flaps, Tape Gun, Overhead Camera)
    // =========================================================================
    const stPack = stations[2].group;
    // Packing Workbench Table
    box(stPack, 2.1, 0.1, 1.6, 0, 0.85, -0.05, M.body, 0.03);
    for (const x of [-0.92, 0.92]) for (const z of [-0.75, 0.65]) cyl(stPack, 0.05, 0.85, x, 0.425, z, M.chrome);

    // THE PROMINENT 3D CARDBOARD BOX
    const cardboardBox = new THREE.Group();
    cardboardBox.position.set(0, 0.9, 0.05);
    stPack.add(cardboardBox);
    // Box bottom
    box(cardboardBox, 0.92, 0.04, 0.82, 0, 0.02, 0, M.cardboard);
    // 4 Walls
    box(cardboardBox, 0.04, 0.55, 0.82, -0.44, 0.295, 0, M.cardboard);
    box(cardboardBox, 0.04, 0.55, 0.82, 0.44, 0.295, 0, M.cardboard);
    box(cardboardBox, 0.92, 0.55, 0.04, 0, 0.295, -0.39, M.cardboard);
    box(cardboardBox, 0.92, 0.55, 0.04, 0, 0.295, 0.39, M.cardboard);
    // 4 Open Angled Flaps (flapped outward ~35 degrees)
    const flapLeft = box(cardboardBox, 0.03, 0.22, 0.82, -0.52, 0.63, 0, M.cardboard);
    flapLeft.rotation.z = Math.PI / 5;
    const flapRight = box(cardboardBox, 0.03, 0.22, 0.82, 0.52, 0.63, 0, M.cardboard);
    flapRight.rotation.z = -Math.PI / 5;
    const flapBack = box(cardboardBox, 0.92, 0.22, 0.03, 0, 0.63, -0.47, M.cardboard);
    flapBack.rotation.x = -Math.PI / 5;
    const flapFront = box(cardboardBox, 0.92, 0.22, 0.03, 0, 0.63, 0.47, M.cardboard);
    flapFront.rotation.x = Math.PI / 5;

    // Goods Packed Inside Open Box
    cyl(cardboardBox, 0.11, 0.42, -0.18, 0.25, -0.05, M.productBlue); // Water Bottle
    box(cardboardBox, 0.26, 0.35, 0.24, 0.18, 0.21, 0.05, M.productYellow, 0.01); // Product unit
    box(cardboardBox, 0.82, 0.06, 0.72, 0, 0.06, 0, M.ivory); // Cushioning paper

    // Red Packing Tape Gun Dispenser on the Table
    const tapeGun = new THREE.Group();
    tapeGun.position.set(0.68, 0.91, -0.35);
    tapeGun.rotation.y = -Math.PI / 4;
    stPack.add(tapeGun);
    box(tapeGun, 0.08, 0.24, 0.08, 0, 0.12, 0, M.tapeRed, 0.02); // Handle
    cyl(tapeGun, 0.12, 0.08, 0, 0.26, 0.12, M.tapeRoll); // Tape roll
    box(tapeGun, 0.14, 0.06, 0.12, 0, 0.34, 0.05, M.tapeRed); // Frame
    box(tapeGun, 0.12, 0.02, 0.06, 0, 0.36, 0.16, M.chrome); // Cutter blade

    // Overhead Articulated Camera Boom (Pre-Seal Carton Audit)
    const cameraBoom = new THREE.Group();
    cameraBoom.position.set(0, 0.9, -0.65);
    stPack.add(cameraBoom);
    cyl(cameraBoom, 0.045, 1.45, 0.65, 0.72, 0, M.chrome); // Vertical arm
    const boomArm = cyl(cameraBoom, 0.035, 0.92, 0.32, 1.45, 0.35, M.chrome);
    boomArm.rotation.x = Math.PI / 3;
    // Camera unit pointed downward into the open cardboard box
    const camUnit = box(cameraBoom, 0.24, 0.2, 0.26, 0, 1.38, 0.65, M.dark, 0.03);
    cyl(camUnit, 0.085, 0.06, 0, -0.12, 0, M.chrome); // Lens
    cyl(camUnit, 0.045, 0.07, 0, -0.14, 0, M.productBlue);

    // Pre-Seal Audit Display Screen
    const packScreenTex = canvasTexture(400, 260, (c, w, h) => {
      c.fillStyle = '#0F172A';
      c.fillRect(0, 0, w, h);
      print(c, '03 PRE-SEAL PACK AUDIT', 20, 36, 18, '#22C55E', 700);
      print(c, '• Manifest vs Box Image: MATCH ✓', 20, 80, 15, '#F8FAFC', 600);
      print(c, '• SKU-BOTTLE-750: Count 2 verified', 20, 118, 14, '#CBD5E1', 500);
      print(c, '• SKU-NOTEBOOK-A5: Count 1 verified', 20, 152, 14, '#CBD5E1', 500);
      print(c, '• Foreign Objects: None Detected', 20, 186, 14, '#CBD5E1', 500);
      print(c, 'STATUS: APPROVED TO TAPE SEAL', 20, 230, 17, '#86EFAC', 700);
    });
    screen(stPack, 1.15, 0.75, -0.42, 1.5, -0.92, packScreenTex);

    // =========================================================================
    // STATION 4: RETURNS & CONDITION GRADING (Returned Parcel, Grade A/B/C Bins)
    // =========================================================================
    const stReturns = stations[3].group;
    // Returns Inspection Table
    box(stReturns, 2.1, 0.1, 1.6, 0, 0.85, -0.05, M.body, 0.03);
    for (const x of [-0.92, 0.92]) for (const z of [-0.75, 0.65]) cyl(stReturns, 0.05, 0.85, x, 0.425, z, M.chrome);

    // Returned Customer Parcel with yellow RMA tag
    const returnBox = box(stReturns, 0.65, 0.45, 0.55, -0.48, 1.12, 0.12, M.cardboardDark, 0.02);
    // Yellow Return / RMA Sticker
    box(returnBox, 0.28, 0.02, 0.22, 0, 0.23, 0, M.hazard);

    // 3-Tier Colored Sorting Bins on Steel Rack
    const binRack = new THREE.Group();
    binRack.position.set(0.48, 0.9, -0.15);
    stReturns.add(binRack);
    // Green Bin: Grade A Restock
    box(binRack, 0.58, 0.26, 0.44, 0, 0.16, 0.42, M.binGreen, 0.02);
    box(binRack, 0.24, 0.08, 0.01, 0, 0.16, 0.65, M.paper); // Label: GRADE A
    // Amber Bin: Grade B Refurbish
    box(binRack, 0.58, 0.26, 0.44, 0, 0.48, 0.05, M.binAmber, 0.02);
    box(binRack, 0.24, 0.08, 0.01, 0, 0.48, 0.28, M.paper); // Label: GRADE B
    // Red Bin: Grade C Liquidate / Dispute
    box(binRack, 0.58, 0.26, 0.44, 0, 0.80, -0.32, M.binRed, 0.02);
    box(binRack, 0.24, 0.08, 0.01, 0, 0.80, -0.09, M.paper); // Label: GRADE C

    // Handheld Scanner on Return Dock
    cyl(stReturns, 0.08, 0.08, -0.45, 0.94, -0.45, M.dark);
    box(stReturns, 0.12, 0.22, 0.14, -0.45, 1.08, -0.45, M.chrome);

    // Returns Grading Monitor
    const returnsScreenTex = canvasTexture(380, 240, (c, w, h) => {
      c.fillStyle = '#0F172A';
      c.fillRect(0, 0, w, h);
      print(c, '04 RETURNS TRIAGE', 20, 36, 18, '#22C55E', 700);
      print(c, '• Grade A (Restock): Original Seal Intact', 20, 80, 14, '#86EFAC', 600);
      print(c, '• Grade B (Refurbish): Open Box Only', 20, 120, 14, '#FDE047', 600);
      print(c, '• Grade C (Liquidate): Damage Contradicts Baseline', 20, 160, 14, '#FDA4AF', 600);
      print(c, 'DISPOSITION: RESTOCK AUTHORIZED', 20, 205, 17, '#22C55E', 700);
    });
    screen(stReturns, 1.15, 0.75, 0, 1.5, -0.92, returnsScreenTex);

    // =========================================================================
    // STATION 5: RECOVERY & FINANCIAL AUDIT (Desk, 3D Brass Balance Scale, Dispute Ledger)
    // =========================================================================
    const stRecovery = stations[4].group;
    // Executive Obsidian & Chrome Audit Desk
    box(stRecovery, 2.2, 0.12, 1.6, 0, 0.85, -0.05, M.dark, 0.03);
    box(stRecovery, 0.2, 0.8, 1.4, -0.92, 0.42, -0.05, M.body);
    box(stRecovery, 0.2, 0.8, 1.4, 0.92, 0.42, -0.05, M.body);

    // 3D BRASS BALANCE SCALE OF JUSTICE & FINANCIAL RECONCILIATION
    const balanceScale = new THREE.Group();
    balanceScale.position.set(-0.35, 0.9, 0.1);
    stRecovery.add(balanceScale);
    // Base pedestal & central pillar
    cyl(balanceScale, 0.22, 0.08, 0, 0.04, 0, M.gold);
    cyl(balanceScale, 0.05, 0.85, 0, 0.48, 0, M.gold);
    cyl(balanceScale, 0.09, 0.1, 0, 0.92, 0, M.brass); // Pivot sphere
    // Horizontal balance beam
    const beam = box(balanceScale, 0.88, 0.04, 0.04, 0, 0.92, 0, M.gold);
    beam.rotation.z = -0.06; // Slightly tilted showing merchant evidence outweighs fee claim!
    // Left Pan: Marketplace Fee Claim
    cyl(balanceScale, 0.16, 0.03, -0.38, 0.58, 0, M.gold);
    box(balanceScale, 0.015, 0.32, 0.015, -0.38, 0.74, 0, M.chrome);
    box(balanceScale, 0.12, 0.08, 0.12, -0.38, 0.63, 0, M.copper); // Claim weight
    // Right Pan: Verified Cryptographic Evidence
    cyl(balanceScale, 0.16, 0.03, 0.38, 0.52, 0, M.gold);
    box(balanceScale, 0.015, 0.38, 0.015, 0.38, 0.71, 0, M.chrome);
    box(balanceScale, 0.14, 0.12, 0.14, 0.38, 0.60, 0, M.gold); // Evidence weight

    // Financial Audit Monitor
    const recoveryScreenTex = canvasTexture(400, 260, (c, w, h) => {
      c.fillStyle = '#0F172A';
      c.fillRect(0, 0, w, h);
      print(c, '05 FINANCIAL RECOVERY AUDIT', 20, 36, 18, '#22C55E', 700);
      print(c, 'FEE CLAIM CONTRADICTED ✓', 20, 85, 22, '#FFFFFF', 800);
      print(c, '+$2,840.00 RECOVERED', 20, 130, 26, '#22C55E', 800);
      print(c, '• Evidence Records: RCV + PRP + PCK + RTN', 20, 170, 14, '#CBD5E1', 500);
      print(c, '• Cryptographic Status: SEALED & IMMUTABLE', 20, 202, 14, '#94A3B8', 500);
      print(c, 'RESOLUTION: 100% REIMBURSEMENT', 20, 240, 16, '#86EFAC', 700);
    });
    screen(stRecovery, 1.25, 0.85, 0.35, 1.52, -0.85, recoveryScreenTex);

    // =========================================================================
    // STRAIGHT DIRECTIONAL CONVEYOR BELT (Runs across all 5 stations from Left to Right)
    // =========================================================================
    const belt = new THREE.Group();
    machine.add(belt);

    // Main heavy conveyor chassis frame
    box(belt, 13.8, 0.28, 1.1, 0, 0.65, 0.85, M.dark);
    box(belt, 13.6, 0.04, 1.05, 0, 0.80, 0.85, M.rubber);

    // Dual Chrome Side Guide Rails with vertical supports
    for (const zSide of [0.32, 1.38]) {
      cyl(belt, 0.024, 13.6, 0, 0.92, zSide, M.chrome, undefined, 12);
      for (let x = -6.0; x <= 6.0; x += 1.5) {
        cyl(belt, 0.02, 0.16, x, 0.84, zSide, M.dark, undefined, 12);
      }
    }

    // Chrome Rotating Conveyor Rollers Spaced Evenly
    const rollerCount = 28;
    const rollers: THREE.Mesh[] = [];
    for (let i = 0; i < rollerCount; i++) {
      const x = -5.8 + (i / (rollerCount - 1)) * 11.6;
      const rMesh = cyl(belt, 0.048, 0.94, x, 0.825, 0.85, M.chrome, undefined, 16);
      rMesh.rotation.x = Math.PI / 2;
      rollers.push(rMesh);
    }

    // Directional Chevron Arrows Glowing along front edge (➔ ➔ ➔)
    const chevronTex = canvasTexture(1024, 64, (c, w, h) => {
      c.fillStyle = '#1E293B';
      c.fillRect(0, 0, w, h);
      for (let x = 32; x < w; x += 96) {
        c.fillStyle = '#22C55E';
        c.beginPath();
        c.moveTo(x, 16);
        c.lineTo(x + 24, 32);
        c.lineTo(x, 48);
        c.lineTo(x + 10, 48);
        c.lineTo(x + 34, 32);
        c.lineTo(x + 10, 16);
        c.closePath();
        c.fill();
      }
    });
    screen(belt, 13.6, 0.18, 0, 0.66, 1.41, chevronTex);

    // =========================================================================
    // EXACTLY ONE 3D CARDBOARD PARCEL - Moves Sequentially from Station 1 to 5
    // =========================================================================
    const reportGroup = new THREE.Group();
    reportGroup.userData.moving = true;
    machine.add(reportGroup);

    // Authentic Kraft Cardboard Box Unit
    box(reportGroup, 0.72, 0.46, 0.58, 0, 0.23, 0, M.cardboard, 0.025);
    // Sealing tape strip across top
    box(reportGroup, 0.74, 0.015, 0.12, 0, 0.465, 0, M.copper);
    // Shipping Barcode label on side
    const labelTex = canvasTexture(256, 128, (c, w, h) => {
      c.fillStyle = '#FFFFFF';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#0F172A';
      c.font = 'bold 16px monospace';
      c.fillText('EVIDENCE CONTRACT', 12, 28);
      c.font = 'bold 18px monospace';
      c.fillText('UNIT-0006', 12, 54);
      for (let x = 12; x < w - 12; x += 6) {
        c.fillRect(x, 65, Math.random() > 0.3 ? 3 : 1, 45);
      }
    });
    screen(reportGroup, 0.42, 0.22, 0, 0.23, 0.295, labelTex);

    // Glowing verification ring
    const haloRing = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.54, 36),
      new THREE.MeshBasicMaterial({
        color: 0x22C55E,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    haloRing.rotation.x = -Math.PI / 2;
    haloRing.position.y = -0.01;
    reportGroup.add(haloRing);

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

    // Sequential Stages Coordinates along the straight conveyor (Left to Right)
    const STAGE_STOPS = [
      { x: -5.2, id: 'receiving', name: 'Receiving Dock' },
      { x: -2.6, id: 'prep', name: 'Prep (FBA)' },
      { x: 0.0, id: 'pack', name: 'Pack (MFN)' },
      { x: 2.6, id: 'returns', name: 'Returns Triage' },
      { x: 5.2, id: 'recovery', name: 'Recovery Audit' },
    ];

    let playing = !reduceMotion;
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

    // Sequential Progress Logic
    let currentStageIndex = 0;
    let stageTimer = 0;
    const STAY_DURATION = 2.4; // Time report stays at each station
    const MOVE_DURATION = 1.6; // Time report takes to glide to next station
    let isMoving = false;
    let moveProgress = 0;
    let pipelineFinished = false;

    const desiredPosition = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3(0, 1.0, 0);
    const viewDirection = new THREE.Vector3(3.2, 9.2, 19).normalize();
    let baseDistance = 24;
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
      const availableWidth = mobile ? 0.92 : Math.min(0.58, aspect > 2 ? 0.56 : 0.60);
      const horizontalFit =
        18.5 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect * availableWidth);
      const verticalFit =
        12.0 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (embedded ? 0.85 : 0.62));
      baseDistance =
        (Math.max(horizontalFit, verticalFit) * (mobile ? 0.98 : 1)) /
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
        desiredTarget.copy(s.group.position).add(new THREE.Vector3(0, 1.25, 0.2));
        desiredPosition.copy(desiredTarget).addScaledVector(viewDirection, mobile ? 8 : 10);
      } else if (cameraMode === 'side') {
        desiredTarget.set(0, 1.0, 0);
        desiredPosition.set(16, 6, 9).normalize().multiplyScalar(baseDistance).add(desiredTarget);
      } else if (cameraMode === 'top') {
        desiredTarget.set(0, 1.0, 0);
        desiredPosition.set(0.01, baseDistance, 0.4).add(desiredTarget);
      } else {
        // OVERVIEW default
        desiredTarget.set(0, 1.0, 0);
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

    function replayPipeline() {
      currentStageIndex = 0;
      stageTimer = 0;
      isMoving = false;
      moveProgress = 0;
      pipelineFinished = false;
      options.onStageChange?.(STAGE_STOPS[0].name);
      play();
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
      replayPipeline,
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
    let simTime = 0;
    let rafId = 0;

    function animate(now: number) {
      rafId = requestAnimationFrame(animate);
      const dt = Math.max(0, Math.min((now - lastFrame) / 1000, 0.045));
      lastFrame = now;
      if (!visible || contextLost) return;

      if (playing) {
        simTime += dt;

        // SEQUENTIAL STATION DISPATCH LOGIC
        if (!pipelineFinished) {
          if (!isMoving) {
            stageTimer += dt;
            if (stageTimer >= STAY_DURATION) {
              if (currentStageIndex < STAGE_STOPS.length - 1) {
                isMoving = true;
                moveProgress = 0;
              } else {
                pipelineFinished = true;
                options.onComplete?.();
              }
            }
          } else {
            moveProgress += dt / MOVE_DURATION;
            if (moveProgress >= 1) {
              moveProgress = 1;
              isMoving = false;
              stageTimer = 0;
              currentStageIndex += 1;
              options.onStageChange?.(STAGE_STOPS[currentStageIndex].name);
            }
          }
        }
      }

      const t = simTime;
      const tact = (t * TAU) / 4;
      const smooth = 1 - Math.exp(-dt * 5);

      // Station pulse: the active station pulses brightly
      stations.forEach((s, i) => {
        const isCurrentActive = i === currentStageIndex && !pipelineFinished;
        const isPastDone = i < currentStageIndex || pipelineFinished;
        const targetIntensity = isCurrentActive
          ? 2.8 + Math.sin(tact * 2) * 1.0
          : isPastDone
          ? 1.5
          : 0.35;

        s.glowMat.emissiveIntensity = THREE.MathUtils.lerp(
          s.glowMat.emissiveIntensity,
          hovered === s.id ? 3.5 : targetIntensity,
          smooth
        );
      });

      // Rollers rotate when conveyor is active
      if (playing && (!pipelineFinished || isMoving)) {
        rollers.forEach((r) => {
          r.rotation.z += dt * 4;
        });
      }

      // Compute exact position of the single 3D cardboard parcel along straight conveyor
      let currentX = STAGE_STOPS[currentStageIndex]?.x ?? -5.2;
      if (isMoving && currentStageIndex < STAGE_STOPS.length - 1) {
        const startX = STAGE_STOPS[currentStageIndex].x;
        const nextX = STAGE_STOPS[currentStageIndex + 1].x;
        // Smooth ease-in-out movement
        const eased = moveProgress < 0.5
          ? 2 * moveProgress * moveProgress
          : 1 - Math.pow(-2 * moveProgress + 2, 2) / 2;
        currentX = THREE.MathUtils.lerp(startX, nextX, eased);
      }

      reportGroup.position.set(currentX, 0.88, 0.85);
      reportGroup.rotation.set(0, 0, 0);

      // Station inspection animations
      if (playing) {
        laserBeam.material.opacity = 0.25 + Math.sin(t * 8) * 0.2;
        worker.rotation.y = Math.sin(t * 2.5) * 0.05;
        beam.rotation.z = -0.05 + Math.sin(t * 2) * 0.02;
      }

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
        now - lastInteraction > 8000;
      controls.autoRotateSpeed = 0.22;
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
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
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

/* Floating Status / Complete Integration Banner */
.agentic-factory-3d .pipeline-floating-banner {
  position: absolute;
  top: 18px;
  left: 20px;
  z-index: 20;
  pointer-events: auto;
}
.agentic-factory-3d .live-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
}
.agentic-factory-3d .live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #16A34A;
  box-shadow: 0 0 8px rgba(22, 163, 74, 0.8);
  animation: af3d-pulse 1.8s ease-in-out infinite;
}
@keyframes af3d-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
}
.agentic-factory-3d .live-badge strong {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #0F172A;
  line-height: 1.2;
}
.agentic-factory-3d .live-badge small {
  display: block;
  font-size: 10px;
  color: #64748B;
  font-weight: 600;
}
.agentic-factory-3d .complete-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  padding: 8px 16px;
  border-radius: 9999px;
  border: 1px solid rgba(22, 163, 74, 0.4);
  box-shadow: 0 4px 16px rgba(22, 163, 74, 0.15);
}
.agentic-factory-3d .badge-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #16A34A;
  color: #FFFFFF;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 12px;
}
.agentic-factory-3d .complete-badge strong {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: #0F172A;
}
.agentic-factory-3d .complete-badge small {
  display: block;
  font-size: 10px;
  color: #16A34A;
  font-weight: 600;
}
.agentic-factory-3d .replay-btn {
  margin-left: 8px;
  padding: 4px 10px;
  font-size: 10px;
  font-weight: 700;
  background: #0F172A;
  color: #FFFFFF;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.agentic-factory-3d .replay-btn:hover {
  background: #1E293B;
  transform: translateY(-1px);
}

/* Backgroundless Controls */
.agentic-factory-3d .controls {
  position: absolute;
  bottom: 16px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 15;
}
.agentic-factory-3d .camera-row {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 6px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(226, 232, 240, 0.8);
  backdrop-filter: blur(8px);
  border-radius: 9999px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}
.agentic-factory-3d .camera-row .caption {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: #64748B;
  padding: 0 6px 0 4px;
}
.agentic-factory-3d .camera-row button {
  border: 0;
  background: transparent;
  color: #475569;
  padding: 5px 9px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.15s;
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
  height: 12px;
  background: rgba(203, 213, 225, 0.8);
  margin: 0 3px;
}
.agentic-factory-3d .camera-row #play {
  padding: 5px 8px;
  display: grid;
  place-items: center;
}

/* Backgroundless Hint */
.agentic-factory-3d .footer {
  position: absolute;
  bottom: 16px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: none;
  z-index: 10;
}
.agentic-factory-3d .hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748B;
  font-size: 11px;
  font-weight: 500;
  background: transparent !important;
  border: none !important;
}

.agentic-factory-3d #tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 25;
  opacity: 0;
  transition: opacity 0.15s;
  padding: 10px 14px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
  border-radius: 12px;
  max-width: 260px;
}
.agentic-factory-3d #tooltip.visible {
  opacity: 1;
}
.agentic-factory-3d #tooltip strong {
  font-size: 12px;
  font-weight: 700;
  color: #0F172A;
  display: flex;
  align-items: center;
  gap: 6px;
}
.agentic-factory-3d #tooltip strong span {
  color: #16A34A;
  font-family: ui-monospace, monospace;
}
.agentic-factory-3d #tooltip p {
  font-size: 11px;
  color: #475569;
  margin: 4px 0 0;
  line-height: 1.4;
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
  border: 2px solid rgba(15, 23, 42, 0.2);
  border-top-color: #0F172A;
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
