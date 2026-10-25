"use client";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { makeRng } from "@/lib/lowpoly/core";

/** A deliberately composed Apollo 11 illustration, separate from generated film assets. */
function MoonLanding() {
  const scene = useMemo(() => {
    const root = new THREE.Group();
    const resources: { dispose(): void }[] = [];
    const material = (color: string, metalness = 0, roughness = 0.8) => {
      const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });
      resources.push(m);
      return m;
    };
    const moon = material("#9b9ea5");
    const edge = material("#555c68");
    const rim = material("#b6b7bb");
    const dark = material("#252e3e");
    const gold = material("#d6a545", 0.5, 0.4);
    const goldDark = material("#966426", 0.3);
    const white = material("#eeece3");
    const silver = material("#aab5c0", 0.6, 0.4);
    const visor = material("#b77b25", 0.75, 0.2);
    const red = material("#bd443c");
    const blue = material("#334e82");
    const mesh = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      pos: [number, number, number],
      parent: THREE.Group = root,
    ) => {
      resources.push(geometry);
      const obj = new THREE.Mesh(geometry, mat);
      obj.position.set(...pos);
      obj.castShadow = true;
      obj.receiveShadow = true;
      parent.add(obj);
      return obj;
    };
    const box = (size: [number, number, number], mat: THREE.Material, pos: [number, number, number], parent = root) =>
      mesh(new THREE.BoxGeometry(...size), mat, pos, parent);
    const beam = (
      a: [number, number, number],
      b: [number, number, number],
      radius: number,
      mat: THREE.Material,
      parent = root,
    ) => {
      const start = new THREE.Vector3(...a),
        end = new THREE.Vector3(...b);
      const delta = end.clone().sub(start);
      const obj = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), mat, [0, 0, 0], parent);
      obj.position.copy(start.add(end).multiplyScalar(0.5));
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    };
    // The entire tableau stays inside the lunar terrain at every allowed angle.
    mesh(new THREE.CylinderGeometry(5.3, 5.1, 0.55, 64), edge, [0, -0.33, 0]);
    mesh(new THREE.CylinderGeometry(5.3, 5.3, 0.12, 64), moon, [0, 0, 0]);
    const rng = makeRng(1969);
    for (let i = 0; i < 65; i++) {
      const a = rng() * Math.PI * 2,
        r = 1.5 + rng() * 3.5;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      if (Math.abs(x) < 2.4 && z > -2.5 && z < 2.4) continue;
      const rock = mesh(new THREE.IcosahedronGeometry(0.06 + rng() * 0.18, 0), rng() > 0.5 ? rim : edge, [x, 0.08, z]);
      rock.scale.set(1.3, 0.65, 1);
      rock.rotation.set(rng(), rng(), rng());
    }
    for (const [x, z, r] of [
      [-3.5, 1.2, 0.65],
      [2.7, -2.7, 0.8],
      [1.4, 3.5, 0.48],
      [-2.5, -2.5, 0.35],
    ]) {
      const ring = mesh(new THREE.TorusGeometry(r, r * 0.13, 5, 24), rim, [x, 0.08, z]);
      ring.rotation.x = Math.PI / 2;
      ring.scale.z = 0.35;
      const hollow = mesh(new THREE.CircleGeometry(r * 0.85, 24), edge, [x, 0.065, z]);
      hollow.rotation.x = -Math.PI / 2;
    }
    const lander = new THREE.Group();
    lander.position.set(-0.45, 0, -0.6);
    root.add(lander);
    mesh(new THREE.CylinderGeometry(1.15, 1.25, 1.02, 8), gold, [0, 1.42, 0], lander).rotation.y = Math.PI / 8;
    // Contrasting foil panels around the octagonal descent stage.
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const panel = box(
        [0.66, 0.73, 0.035],
        i % 2 ? goldDark : gold,
        [Math.sin(a) * 1.15, 1.43, Math.cos(a) * 1.15],
        lander,
      );
      panel.rotation.y = a;
    }
    mesh(new THREE.CylinderGeometry(0.23, 0.45, 0.5, 12), dark, [0, 0.7, 0], lander);
    const cabin = mesh(new THREE.CylinderGeometry(0.86, 1.05, 1.4, 8), silver, [0, 2.63, 0], lander);
    cabin.rotation.y = Math.PI / 8;
    box([1.3, 0.72, 0.6], white, [0, 2.68, 0.7], lander);
    for (const x of [-0.37, 0.37]) {
      const window = mesh(new THREE.CircleGeometry(0.3, 3), dark, [x, 2.85, 1.01], lander);
      window.rotation.z = Math.PI / 2;
    }
    box([0.5, 0.55, 0.06], dark, [0, 2.2, 1.04], lander);
    box([0.38, 0.43, 0.08], white, [0, 2.2, 1.08], lander);
    box([0.65, 0.65, 0.9], dark, [-1, 2.5, -0.15], lander);
    mesh(new THREE.SphereGeometry(0.4, 8, 6), silver, [1.0, 2.45, 0.1], lander);
    beam([0.2, 3.25, -0.25], [0.2, 4.1, -0.25], 0.025, silver, lander);
    const dish = mesh(
      new THREE.SphereGeometry(0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      white,
      [0.2, 4.02, -0.25],
      lander,
    );
    dish.rotation.x = 0.8;
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const x = Math.sin(a),
        z = Math.cos(a);
      beam([x * 0.9, 1.7, z * 0.9], [x * 2.0, 0.18, z * 2.0], 0.065, gold, lander);
      beam([x * 0.6, 1, z * 0.6], [x * 1.8, 0.5, z * 1.8], 0.04, silver, lander);
      mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.1, 12), gold, [x * 2, 0.14, z * 2], lander);
    }
    // Front ladder and individually visible rungs.
    for (const x of [-0.23, 0.23]) beam([x, 2, 1.16], [x, 0.28, 2.0], 0.027, silver, lander);
    for (let i = 0; i < 8; i++) {
      const p = i / 7;
      beam([-0.23, 0.4 + p * 1.5, 1.94 - p * 0.73], [0.23, 0.4 + p * 1.5, 1.94 - p * 0.73], 0.025, silver, lander);
    }
    // Astronaut with pressure suit, life-support backpack and reflective visor.
    const astronaut = new THREE.Group();
    astronaut.position.set(2.2, 0.1, 1.25);
    astronaut.rotation.y = -0.25;
    root.add(astronaut);
    box([0.48, 0.62, 0.3], white, [0, 0.9, 0], astronaut);
    box([0.4, 0.55, 0.25], silver, [0, 0.93, -0.23], astronaut);
    box([0.22, 0.2, 0.04], silver, [0, 1.0, 0.17], astronaut);
    mesh(new THREE.SphereGeometry(0.29, 12, 8), white, [0, 1.43, 0], astronaut);
    const face = mesh(new THREE.SphereGeometry(0.235, 12, 8), visor, [0, 1.45, 0.14], astronaut);
    face.scale.set(1, 0.83, 0.6);
    for (const x of [-0.15, 0.15]) {
      beam([x, 0.65, 0], [x * 1.15, 0.22, 0.04], 0.11, white, astronaut);
      box([0.23, 0.14, 0.35], white, [x * 1.15, 0.1, 0.12], astronaut);
      beam([x * 1.9, 1.1, 0], [x * 2.4, 0.7, 0.12], 0.09, white, astronaut);
    }
    // A rigid support bar: flags on the Moon do not flutter in wind.
    beam([3.3, 0.1, -0.1], [3.3, 2.75, -0.1], 0.025, silver);
    box([1.1, 0.025, 0.025], silver, [3.85, 2.75, -0.1]);
    box([1.1, 0.65, 0.025], white, [3.85, 2.4, -0.1]);
    for (let i = 0; i < 7; i++) box([1.1, 0.05, 0.03], red, [3.85, 2.7 - i * 0.1, -0.08]);
    box([0.48, 0.35, 0.04], blue, [3.54, 2.55, -0.06]);
    for (let i = 0; i < 9; i++)
      box([0.035, 0.035, 0.012], white, [3.39 + (i % 3) * 0.14, 2.65 - Math.floor(i / 3) * 0.1, -0.032]);
    for (let i = 0; i < 14; i++) {
      const footprint = mesh(new THREE.CircleGeometry(0.065, 8), edge, [
        0.1 + i * 0.14,
        0.068,
        1.9 + Math.sin(i * 0.45) * 0.16 + (i % 2) * 0.15,
      ]);
      footprint.rotation.x = -Math.PI / 2;
      footprint.scale.y = 1.6;
    }
    return { root, resources };
  }, []);
  useEffect(() => () => scene.resources.forEach((r) => r.dispose()), [scene]);
  return <primitive object={scene.root} />;
}

function DragCamera({ resetKey }: { resetKey: number }) {
  const { camera, gl, invalidate, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.position.set(8, 6, 12);
    // Three.js cameras are mutable scene objects; update their projection imperatively.
    // eslint-disable-next-line react-hooks/immutability
    cam.zoom = Math.min(size.width / 12.5, size.height / 10.3);
    cam.updateProjectionMatrix();
    const controls = new OrbitControls(cam, gl.domElement);
    controls.target.set(0, 1.2, 0);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = false;
    controls.autoRotate = false;
    controls.minPolarAngle = 0.65;
    controls.maxPolarAngle = 1.4;
    controls.minAzimuthAngle = -0.6;
    controls.maxAzimuthAngle = 1.6;
    controls.rotateSpeed = 0.7;
    controls.update();
    const change = () => invalidate();
    const key = (e: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const spherical = new THREE.Spherical().setFromVector3(cam.position.clone().sub(controls.target));
      spherical.theta += e.key === "ArrowLeft" ? -0.12 : e.key === "ArrowRight" ? 0.12 : 0;
      spherical.phi += e.key === "ArrowUp" ? -0.08 : e.key === "ArrowDown" ? 0.08 : 0;
      cam.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target));
      controls.update();
      invalidate();
    };
    gl.domElement.setAttribute("tabindex", "0");
    gl.domElement.setAttribute("aria-label", "Apollo 11 Moon landing. Drag to orbit, or use the arrow keys.");
    gl.domElement.addEventListener("keydown", key);
    controls.addEventListener("change", change);
    invalidate();
    return () => {
      controls.dispose();
      gl.domElement.removeEventListener("keydown", key);
    };
  }, [camera, gl, invalidate, size.width, size.height, resetKey]);
  return null;
}

export function HeroScene() {
  const [resetKey, setResetKey] = useState(0);
  return (
    <div className="moon-scene">
      <Canvas
        orthographic
        shadows="percentage"
        frameloop="demand"
        dpr={[1, 1.75]}
        camera={{ position: [8, 6, 12], zoom: 40, near: 0.1, far: 100 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      >
        <hemisphereLight args={["#d8e8ff", "#596273", 1.3]} />
        <directionalLight
          position={[-6, 12, 8]}
          intensity={3.2}
          color="#fff5df"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-normalBias={0.04}
        />
        <directionalLight position={[6, 3, -8]} intensity={1.2} color="#99bcff" />
        <MoonLanding />
        <DragCamera resetKey={resetKey} />
      </Canvas>
      <button className="scene-reset" onClick={() => setResetKey((k) => k + 1)}>
        Reset view ↺
      </button>
    </div>
  );
}
