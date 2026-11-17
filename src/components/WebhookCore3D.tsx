import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ChevronDown, ChevronUp, Layers, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { IncidentItem, WebhookEventItem } from '../types';

interface WebhookCore3DProps {
  incident: IncidentItem | null;
  webhookEvents: WebhookEventItem[];
  reducedMotion: boolean;
  onSelectNode: (nodeId: string) => void;
  selectedNodeId: string;
}

type CameraPreset = 'overview' | 'crypto' | 'ingress';

const _vec3Target = new THREE.Vector3();
const _vec3Cam = new THREE.Vector3();
const _dummy = new THREE.Object3D();

function detectSoftwareWebGL(): { available: boolean; isSoftwareGl: boolean } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      return { available: false, isSoftwareGl: true };
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return { available: true, isSoftwareGl };
  } catch {
    return { available: false, isSoftwareGl: true };
  }
}

function StudioEnvironmentRig() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    return () => {
      envTarget.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);

  return null;
}

interface ObsidianSceneProps {
  severityColor: string;
  isContained: boolean;
  explodeFactor: number;
  speedMultiplier: number;
  cameraPreset: CameraPreset;
  reducedMotion: boolean;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  webhookEvents: WebhookEventItem[];
}

function ObsidianMechanism({
  severityColor,
  isContained,
  explodeFactor,
  speedMultiplier,
  cameraPreset,
  reducedMotion,
  selectedNodeId,
  onSelectNode,
  webhookEvents,
}: ObsidianSceneProps) {
  const coreGroupRef = useRef<THREE.Group>(null);
  const cryptoRingRef = useRef<THREE.Group>(null);
  const ingressRingRef = useRef<THREE.Group>(null);
  const ticksRef = useRef<THREE.InstancedMesh>(null);
  const packetRef = useRef<THREE.InstancedMesh>(null);
  const controlsRef = useRef<any>(null);
  const transitionActive = useRef(false);

  const currentExplode = useRef(0);

  // Pre-build precision brushed obsidian and machined titanium materials
  const materials = useMemo(() => {
    const obsidian = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#0c0c0e'),
      metalness: 0.72,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
    });
    const brushedTitanium = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#d2d6dc'),
      metalness: 0.94,
      roughness: 0.2,
      anisotropy: 0.8,
      clearcoat: 0.35,
    });
    const anodizedGraphite = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#27292e'),
      metalness: 0.85,
      roughness: 0.38,
    });
    const iceAccent = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c3d9f3'),
      emissive: new THREE.Color('#c3d9f3'),
      emissiveIntensity: 0.45,
      metalness: 0.3,
      roughness: 0.25,
    });
    const signalMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(severityColor),
      emissive: new THREE.Color(severityColor),
      emissiveIntensity: isContained ? 0.35 : 0.85,
      metalness: 0.2,
      roughness: 0.2,
    });
    return { obsidian, brushedTitanium, anodizedGraphite, iceAccent, signalMat };
  }, [severityColor, isContained]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [materials]);

  // Populate 48 radial machined precision ticks on the cryptographic gate ring
  useEffect(() => {
    if (!ticksRef.current) return;
    const count = 48;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 2.25;
      _dummy.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      _dummy.rotation.set(0, -angle, 0);
      _dummy.scale.set(i % 4 === 0 ? 1.5 : 0.85, 1, 1);
      _dummy.updateMatrix();
      ticksRef.current.setMatrixAt(i, _dummy.matrix);
    }
    ticksRef.current.instanceMatrix.needsUpdate = true;
    ticksRef.current.computeBoundingSphere();
  }, []);

  useEffect(() => {
    transitionActive.current = true;
  }, [cameraPreset]);

  const { camera } = useThree();

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const motionScale = reducedMotion ? 0 : speedMultiplier;

    // Exponentially damped exploded separation
    currentExplode.current = THREE.MathUtils.damp(
      currentExplode.current,
      explodeFactor,
      6,
      delta,
    );

    if (coreGroupRef.current) {
      coreGroupRef.current.rotation.y += delta * 0.22 * motionScale;
      coreGroupRef.current.position.y = THREE.MathUtils.damp(
        coreGroupRef.current.position.y,
        currentExplode.current * -0.7,
        6,
        delta,
      );
    }

    if (cryptoRingRef.current) {
      cryptoRingRef.current.rotation.y -= delta * 0.35 * motionScale;
      cryptoRingRef.current.rotation.z =
        Math.sin(performance.now() * 0.0004 * motionScale) * 0.14;
      cryptoRingRef.current.position.y = THREE.MathUtils.damp(
        cryptoRingRef.current.position.y,
        currentExplode.current * 0.15,
        6,
        delta,
      );
    }

    if (ingressRingRef.current) {
      ingressRingRef.current.rotation.y += delta * 0.18 * motionScale;
      ingressRingRef.current.rotation.x =
        0.38 + Math.cos(performance.now() * 0.0003 * motionScale) * 0.08;
      ingressRingRef.current.position.y = THREE.MathUtils.damp(
        ingressRingRef.current.position.y,
        currentExplode.current * 0.95,
        6,
        delta,
      );
    }

    // Orbiting webhook trajectory packets (InstancedMesh, zero allocations)
    if (packetRef.current) {
      const time = performance.now() * 0.0008 * Math.max(0.15, motionScale);
      const count = 24;
      for (let i = 0; i < count; i += 1) {
        const phase = (i / count) * Math.PI * 2 + time;
        const laneRadius = 3.15 - ((phase % (Math.PI * 2)) / (Math.PI * 2)) * 2.15;
        const spiralY = Math.sin(phase * 2) * 0.45 + currentExplode.current * 0.35;
        _dummy.position.set(
          Math.cos(phase * 1.4) * laneRadius,
          spiralY,
          Math.sin(phase * 1.4) * laneRadius,
        );
        const s = 0.65 + Math.sin(phase * 3) * 0.25;
        _dummy.scale.setScalar(s);
        _dummy.updateMatrix();
        packetRef.current.setMatrixAt(i, _dummy.matrix);
      }
      packetRef.current.instanceMatrix.needsUpdate = true;
    }

    // Smooth camera preset transitions (cancelled if user touches OrbitControls)
    if (transitionActive.current && controlsRef.current) {
      if (cameraPreset === 'overview') {
        _vec3Cam.set(0, 2.2, 7.6);
        _vec3Target.set(0, 0, 0);
      } else if (cameraPreset === 'crypto') {
        _vec3Cam.set(3.2, 2.8, 3.6);
        _vec3Target.set(0, currentExplode.current * 0.15, 0);
      } else {
        _vec3Cam.set(-4.6, 1.4, 5.2);
        _vec3Target.set(0, currentExplode.current * 0.6, 0);
      }

      camera.position.x = THREE.MathUtils.damp(camera.position.x, _vec3Cam.x, 4.5, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _vec3Cam.y, 4.5, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _vec3Cam.z, 4.5, delta);
      controlsRef.current.target.lerp(_vec3Target, 1 - Math.exp(-4.5 * delta));
      controlsRef.current.update();

      if (camera.position.distanceTo(_vec3Cam) < 0.04) {
        transitionActive.current = false;
      }
    }
  });

  const nodes = [
    {
      id: 'node-ingress-gateway',
      pos: [3.15, 0.2, 0] as [number, number, number],
      label: 'Gateway Ingress',
    },
    {
      id: 'node-crypto-gate',
      pos: [-2.1, 0.55, 1.9] as [number, number, number],
      label: 'HMAC-SHA256 Gate',
    },
    {
      id: 'node-idempotency-gate',
      pos: [0.4, -0.4, -2.65] as [number, number, number],
      label: 'Idempotency Ledger',
    },
  ];

  return (
    <>
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 9, 22]} />
      <StudioEnvironmentRig />

      {/* Warm/Cool studio 3-point lighting */}
      <hemisphereLight args={['#c3d9f3', '#0a0a0c', 0.45]} />
      <directionalLight position={[6, 8, 5]} intensity={1.8} color="#fff5e6" castShadow />
      <directionalLight position={[-6, -3, -5]} intensity={0.9} color="#c3d9f3" />
      <pointLight position={[0, 0, 0]} intensity={isContained ? 0.6 : 1.4} color={severityColor} distance={7} />

      <group position={[0, -0.1, 0]}>
        {/* Layer 1: Inner Obsidian Merchant Order Ledger Core */}
        <group
          ref={coreGroupRef}
          onClick={(e) => {
            e.stopPropagation();
            onSelectNode('node-idempotency-gate');
          }}
        >
          <mesh material={materials.obsidian} castShadow receiveShadow>
            <octahedronGeometry args={[1.05, 1]} />
          </mesh>
          <mesh material={materials.brushedTitanium} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.22, 0.035, 16, 72]} />
          </mesh>
          <mesh material={materials.signalMat} rotation={[0, Math.PI / 4, 0]}>
            <torusGeometry args={[1.34, 0.015, 12, 72]} />
          </mesh>
        </group>

        {/* Layer 2: Middle Cryptographic & Replay Verification Ring */}
        <group
          ref={cryptoRingRef}
          onClick={(e) => {
            e.stopPropagation();
            onSelectNode('node-crypto-gate');
          }}
        >
          <mesh material={materials.anodizedGraphite} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[2.25, 0.06, 20, 96]} />
          </mesh>
          <mesh material={materials.brushedTitanium} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[2.35, 0.018, 12, 96]} />
          </mesh>
          <instancedMesh
            ref={ticksRef}
            args={[undefined, undefined, 48]}
            material={materials.brushedTitanium}
          >
            <boxGeometry args={[0.1, 0.03, 0.025]} />
          </instancedMesh>
        </group>

        {/* Layer 3: Outer Razorpay Gateway Ingress Orbit & Interactive Nodes */}
        <group
          ref={ingressRingRef}
          onClick={(e) => {
            e.stopPropagation();
            onSelectNode('node-ingress-gateway');
          }}
        >
          <mesh material={materials.anodizedGraphite} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[3.15, 0.04, 16, 112]} />
          </mesh>
          <mesh material={materials.iceAccent} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[3.22, 0.012, 12, 112]} />
          </mesh>

          {nodes.map((n) => {
            const active = selectedNodeId === n.id;
            return (
              <mesh
                key={n.id}
                position={n.pos}
                material={active ? materials.signalMat : materials.brushedTitanium}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(n.id);
                }}
              >
                <octahedronGeometry args={[active ? 0.22 : 0.16, 0]} />
              </mesh>
            );
          })}
        </group>

        {/* Live Webhook Event Particle Vectors */}
        <instancedMesh
          ref={packetRef}
          args={[undefined, undefined, Math.max(12, Math.min(24, webhookEvents.length * 6 || 24))]}
          material={isContained ? materials.iceAccent : materials.signalMat}
          frustumCulled={false}
        >
          <octahedronGeometry args={[0.045, 0]} />
        </instancedMesh>

        {/* Subtle Contact Grounding Ring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.15, 0]} receiveShadow>
          <ringGeometry args={[1.1, 3.6, 64]} />
          <meshBasicMaterial color="#161618" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.05}
        minDistance={4.2}
        maxDistance={12}
        onStart={() => {
          transitionActive.current = false;
        }}
      />
    </>
  );
}

function FallbackSchematic2D({
  incident,
  selectedNodeId,
  onSelectNode,
}: {
  incident: IncidentItem | null;
  selectedNodeId: string;
  onSelectNode: (id: string) => void;
}) {
  const [studioImgFailed, setStudioImgFailed] = useState(false);
  const isContained = incident?.status === 'CONTAINED';
  const accent = isContained ? '#5fa657' : incident?.severity === 'CRITICAL' ? '#cf524c' : '#d4a017';

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black px-6">
      {!studioImgFailed && (
        <>
          <img
            src="/src/assets/images/aureon_core_backdrop_1794927494263.jpg"
            alt="AUREON Obsidian Webhook Core studio render with concentric titanium rings"
            referrerPolicy="no-referrer"
            onError={() => setStudioImgFailed(true)}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/75" />
        </>
      )}

      <svg
        viewBox="0 0 640 360"
        className="relative z-10 h-full max-h-[380px] w-full max-w-[680px]"
        role="img"
        aria-label="2D Architectural Webhook Core Schematic"
      >
        <circle cx="320" cy="180" r="145" fill="none" stroke="#262626" strokeWidth="1" />
        <circle cx="320" cy="180" r="102" fill="none" stroke="#3a3a3a" strokeWidth="1" strokeDasharray="4 4" />
        <circle cx="320" cy="180" r="56" fill="#0d0d0d" fillOpacity="0.82" stroke={accent} strokeWidth="1.5" />

        <line x1="175" y1="180" x2="264" y2="180" stroke={accent} strokeWidth="1" />
        <line x1="376" y1="180" x2="465" y2="180" stroke="#c3d9f3" strokeWidth="1" />

        <g
          onClick={() => onSelectNode('node-ingress-gateway')}
          className="cursor-pointer"
        >
          <rect
            x="95"
            y="160"
            width="80"
            height="40"
            fill="#141414"
            stroke={selectedNodeId === 'node-ingress-gateway' ? '#ffffff' : '#3a3a3a'}
          />
          <text x="135" y="184" textAnchor="middle" fill="#cccccc" fontSize="10" fontFamily="JetBrains Mono">
            INGRESS
          </text>
        </g>

        <g
          onClick={() => onSelectNode('node-crypto-gate')}
          className="cursor-pointer"
        >
          <text x="320" y="176" textAnchor="middle" fill="#ffffff" fontSize="11" fontFamily="Saira Condensed" letterSpacing="2">
            HMAC GATE
          </text>
          <text x="320" y="194" textAnchor="middle" fill={accent} fontSize="9" fontFamily="JetBrains Mono">
            {isContained ? 'EQUILIBRIUM' : incident?.failure_class ?? 'ACTIVE'}
          </text>
        </g>

        <g
          onClick={() => onSelectNode('node-idempotency-gate')}
          className="cursor-pointer"
        >
          <rect
            x="465"
            y="160"
            width="95"
            height="40"
            fill="#141414"
            stroke={selectedNodeId === 'node-idempotency-gate' ? '#ffffff' : '#3a3a3a'}
          />
          <text x="512" y="184" textAnchor="middle" fill="#cccccc" fontSize="10" fontFamily="JetBrains Mono">
            ORDER LEDGER
          </text>
        </g>
      </svg>
    </div>
  );
}

export function WebhookCore3D({
  incident,
  webhookEvents,
  reducedMotion,
  onSelectNode,
  selectedNodeId,
}: WebhookCore3DProps) {
  const [glInfo, setGlInfo] = useState<{ available: boolean; isSoftwareGl: boolean }>({
    available: true,
    isSoftwareGl: false,
  });
  const [contextLost, setContextLost] = useState(false);
  const [forceSchematic, setForceSchematic] = useState(false);
  const [explodeFactor, setExplodeFactor] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  useEffect(() => {
    setGlInfo(detectSoftwareWebGL());
  }, []);

  const isContained = incident?.status === 'CONTAINED';
  const severityColor = isContained
    ? '#5fa657'
    : incident?.severity === 'CRITICAL'
      ? '#cf524c'
      : '#d4a017';

  const showFallback = !glInfo.available || contextLost || forceSchematic;

  return (
    <div className="relative h-[540px] w-full overflow-hidden border-y border-[#262626] bg-black md:h-[620px]">
      {showFallback ? (
        <FallbackSchematic2D
          incident={incident}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
      ) : (
        <Canvas
          shadows={!glInfo.isSoftwareGl}
          dpr={glInfo.isSoftwareGl ? 1 : [1, 2]}
          camera={{ position: [0, 2.2, 7.6], fov: 42, near: 0.1, far: 60 }}
          gl={{
            antialias: !glInfo.isSoftwareGl,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.12,
          }}
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            canvas.addEventListener('webglcontextlost', (ev) => {
              ev.preventDefault();
              setContextLost(true);
            });
            canvas.addEventListener('webglcontextrestored', () => {
              setContextLost(false);
            });
          }}
        >
          <ObsidianMechanism
            severityColor={severityColor}
            isContained={isContained}
            explodeFactor={explodeFactor}
            speedMultiplier={speedMultiplier}
            cameraPreset={cameraPreset}
            reducedMotion={reducedMotion}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            webhookEvents={webhookEvents}
          />
        </Canvas>
      )}

      {/* Subtle Bottom-Center Collapsible Cinema Control Dock (No backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center px-4">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto mb-1 flex h-7 items-center gap-2 border border-[#262626] bg-[#0d0d0d] px-4 font-machined text-[10px] tracking-[2px] uppercase text-[#999999] transition-colors hover:border-[#3a3a3a] hover:text-white"
        >
          {dockCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {dockCollapsed ? 'Show Core Controls' : 'Hide Controls'}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto flex w-full max-w-[900px] flex-wrap items-center justify-between gap-4 border border-[#262626] bg-[#0d0d0d]/95 px-5 py-3">
            {/* Camera Presets */}
            <div className="flex items-center gap-2">
              <span className="font-machined text-[10px] tracking-[2px] uppercase text-[#666666]">
                View
              </span>
              {(['overview', 'crypto', 'ingress'] as CameraPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCameraPreset(preset)}
                  className={`font-machined whitespace-nowrap px-3 py-1.5 text-[10px] tracking-[2px] uppercase transition-colors border ${
                    cameraPreset === preset
                      ? 'border-white text-white'
                      : 'border-[#262626] text-[#999999] hover:text-white'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Exploded View Slider */}
            <div className="flex items-center gap-3">
              <Layers className="h-3.5 w-3.5 text-[#999999]" />
              <label
                htmlFor="explode-slider"
                className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]"
              >
                Explode
              </label>
              <input
                id="explode-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={explodeFactor}
                onChange={(e) => setExplodeFactor(Number(e.target.value))}
                className="w-24 accent-white"
              />
            </div>

            {/* Speed & Schematic Toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSpeedMultiplier((s) => (s === 1 ? 2 : s === 2 ? 0.35 : 1))}
                className="font-machined whitespace-nowrap border border-[#262626] px-3 py-1.5 text-[10px] tracking-[2px] uppercase text-[#cccccc] hover:border-white hover:text-white"
              >
                Speed {speedMultiplier}x
              </button>
              <button
                type="button"
                onClick={() => setForceSchematic((v) => !v)}
                className="font-machined whitespace-nowrap border border-[#262626] px-3 py-1.5 text-[10px] tracking-[2px] uppercase text-[#cccccc] hover:border-white hover:text-white"
              >
                {showFallback ? '3D WebGL' : 'Studio Image'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setExplodeFactor(0);
                  setSpeedMultiplier(1);
                  setCameraPreset('overview');
                }}
                aria-label="Reset 3D viewport"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#3a3a3a] text-[#cccccc] hover:border-white hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
