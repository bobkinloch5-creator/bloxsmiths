import { useEffect, useState, useRef } from "react";
import { Loader2 } from "lucide-react";

type Kind = "classic_shirt" | "classic_pants" | "tshirt" | "layered_or_accessory";

/**
 * Client-only 3D preview of a generated Roblox clothing texture.
 * Dynamically imports three.js + react-three-fiber to avoid SSR crashes.
 *
 * Renders a Roblox R6-proportioned blocky avatar with the generated texture
 * mapped onto the correct body parts. Features smooth auto-rotation,
 * environment lighting, a ground plane with contact shadow, and properly
 * cropped UV mapping from the Roblox classic template layout.
 */
export function ClothingPreview3D({
  imageUrl,
  kind,
}: {
  imageUrl: string;
  kind: Kind;
}) {
  const [mod, setMod] = useState<null | {
    Canvas: any;
    OrbitControls: any;
    THREE: any;
  }>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      import("@react-three/fiber"),
      import("@react-three/drei"),
      import("three"),
    ])
      .then(([fiber, drei, three]) => {
        if (alive)
          setMod({ Canvas: fiber.Canvas, OrbitControls: drei.OrbitControls, THREE: three });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
        3D preview couldn't load here — the downloadable PNG is unaffected.
      </div>
    );
  }

  if (!mod) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading 3D preview…
      </div>
    );
  }

  const { Canvas, OrbitControls, THREE } = mod;

  return (
    <div
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Canvas
        camera={{ position: [0, 0.6, 3.8], fov: 38 }}
        dpr={[1, 2]}
        shadows
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        style={{ touchAction: "none" }}
      >
        {/* Dark gradient background */}
        <color attach="background" args={["#0c0d12"]} />
        <fog attach="fog" args={["#0c0d12", 6, 14]} />

        {/* Studio-quality lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[3, 6, 4]}
          intensity={1.6}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-3, 3, -2]} intensity={0.5} color="#8ec5ff" />
        <pointLight position={[0, 4, 0]} intensity={0.3} color="#ffffff" />

        {/* Ground plane with shadow */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.58, 0]}
          receiveShadow
        >
          <planeGeometry args={[8, 8]} />
          <shadowMaterial opacity={0.35} />
        </mesh>

        {/* Faint circular ground ring for visual anchoring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.57, 0]}>
          <ringGeometry args={[0.9, 1.1, 64]} />
          <meshBasicMaterial color="#1a1d28" transparent opacity={0.5} />
        </mesh>

        <Avatar imageUrl={imageUrl} kind={kind} THREE={THREE} />

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={1.5}
          maxDistance={8}
          autoRotate
          autoRotateSpeed={2.0}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 1.4}
          enableDamping
          dampingFactor={0.08}
          panSpeed={0.8}
          zoomSpeed={1.0}
          rotateSpeed={0.8}
          touches={{
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
      </Canvas>
    </div>
  );
}

function useTexture(imageUrl: string, THREE: any) {
  const [tex, setTex] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      imageUrl,
      (t: any) => {
        if (!alive) return;
        t.colorSpace = THREE.SRGBColorSpace;
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        setTex(t);
      },
      undefined,
      () => {
        /* leave tex null → falls back to solid material */
      },
    );
    return () => {
      alive = false;
    };
  }, [imageUrl, THREE]);
  return tex;
}

function Avatar({
  imageUrl,
  kind,
  THREE,
}: {
  imageUrl: string;
  kind: Kind;
  THREE: any;
}) {
  const tex = useTexture(imageUrl, THREE);
  const groupRef = useRef<any>(null);

  // Idle bobbing animation
  useEffect(() => {
    if (!groupRef.current) return;
    let frame: number;
    const start = Date.now();
    const animate = () => {
      const t = (Date.now() - start) / 1000;
      if (groupRef.current) {
        groupRef.current.position.y = -0.15 + Math.sin(t * 1.2) * 0.025;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const skinColor = "#e8c9a6";
  const defaultBaseColor = "#333b45";

  // Classic Roblox template layout coordinates (585×559 canvas)
  // Each value is [x, y, width, height] in pixels
  const TORSO_COORDS = {
    right: [0, 64, 64, 128],
    left: [192, 64, 64, 128],
    top: [128, 0, 128, 64],
    bottom: [256, 0, 128, 64],
    front: [64, 64, 128, 128],
    back: [256, 64, 128, 128],
  };

  const RIGHT_ARM_COORDS = {
    right: [320, 64, 64, 128],
    left: [448, 64, 64, 128],
    top: [320, 0, 64, 64],
    bottom: [384, 0, 64, 64],
    front: [384, 64, 64, 128],
    back: [512, 64, 64, 128],
  };

  const LEFT_ARM_COORDS = {
    right: [320, 320, 64, 128],
    left: [448, 320, 64, 128],
    top: [320, 256, 64, 64],
    bottom: [384, 256, 64, 64],
    front: [384, 320, 64, 128],
    back: [512, 320, 64, 128],
  };

  const RIGHT_LEG_COORDS = {
    right: [0, 320, 64, 128],
    left: [128, 320, 64, 128],
    top: [64, 256, 64, 64],
    bottom: [128, 256, 64, 64],
    front: [64, 320, 64, 128],
    back: [192, 320, 64, 128],
  };

  const LEFT_LEG_COORDS = {
    right: [0, 448 + 64, 64, 128],
    left: [128, 448 + 64, 64, 128],
    top: [64, 448, 64, 64],
    bottom: [128, 448, 64, 64],
    front: [64, 448 + 64, 64, 128],
    back: [192, 448 + 64, 64, 128],
  };

  const CANVAS_W = 585;
  const CANVAS_H = 559;

  const getMaterials = (
    baseTexture: any,
    coords: {
      right: number[];
      left: number[];
      top: number[];
      bottom: number[];
      front: number[];
      back: number[];
    },
    fallbackColor: string,
  ) => {
    if (!baseTexture) {
      return Array(6)
        .fill(null)
        .map(() => new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.7 }));
    }

    const order = [coords.right, coords.left, coords.top, coords.bottom, coords.front, coords.back];

    return order.map((face) => {
      const [x, y, w, h] = face;
      const t = baseTexture.clone();
      t.repeat.set(w / CANVAS_W, h / CANVAS_H);
      t.offset.set(x / CANVAS_W, 1.0 - (y + h) / CANVAS_H);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({
        map: t,
        roughness: 0.65,
        metalness: 0.02,
      });
    });
  };

  // Generate materials for each body part
  let torsoMats: any[];
  let rightArmMats: any[];
  let leftArmMats: any[];
  let rightLegMats: any[];
  let leftLegMats: any[];

  const skinMat = () => new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.75 });

  if (kind === "classic_shirt" && tex) {
    torsoMats = getMaterials(tex, TORSO_COORDS, defaultBaseColor);
    rightArmMats = getMaterials(tex, RIGHT_ARM_COORDS, defaultBaseColor);
    leftArmMats = getMaterials(tex, LEFT_ARM_COORDS, defaultBaseColor);
    rightLegMats = Array(6).fill(null).map(skinMat);
    leftLegMats = Array(6).fill(null).map(skinMat);
  } else if (kind === "classic_pants" && tex) {
    torsoMats = getMaterials(tex, TORSO_COORDS, defaultBaseColor);
    rightArmMats = Array(6).fill(null).map(skinMat);
    leftArmMats = Array(6).fill(null).map(skinMat);
    rightLegMats = getMaterials(tex, RIGHT_LEG_COORDS, defaultBaseColor);
    leftLegMats = getMaterials(tex, LEFT_LEG_COORDS, defaultBaseColor);
  } else if ((kind === "tshirt" || kind === "layered_or_accessory") && tex) {
    const torsoFrontTex = tex.clone();
    const frontMat = new THREE.MeshStandardMaterial({ map: torsoFrontTex, roughness: 0.65 });
    const sideMat = new THREE.MeshStandardMaterial({ color: defaultBaseColor, roughness: 0.7 });

    torsoMats = [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat];
    rightArmMats = Array(6).fill(null).map(skinMat);
    leftArmMats = Array(6).fill(null).map(skinMat);
    rightLegMats = Array(6).fill(null).map(skinMat);
    leftLegMats = Array(6).fill(null).map(skinMat);
  } else {
    const neutralMat = new THREE.MeshStandardMaterial({ color: defaultBaseColor, roughness: 0.7 });
    torsoMats = Array(6).fill(neutralMat);
    rightArmMats = Array(6).fill(null).map(skinMat);
    leftArmMats = Array(6).fill(null).map(skinMat);
    rightLegMats = Array(6).fill(null).map(skinMat);
    leftLegMats = Array(6).fill(null).map(skinMat);
  }

  // R6 proportions (blocky Roblox character)
  const HEAD_SIZE = 0.65;
  const TORSO_W = 1.0;
  const TORSO_H = 1.0;
  const TORSO_D = 0.5;
  const ARM_W = 0.5;
  const ARM_H = 1.0;
  const ARM_D = 0.5;
  const LEG_W = 0.5;
  const LEG_H = 1.0;
  const LEG_D = 0.5;

  const torsoY = LEG_H + TORSO_H / 2;
  const headY = LEG_H + TORSO_H + HEAD_SIZE / 2 + 0.02;
  const armY = LEG_H + TORSO_H / 2;
  const armX = TORSO_W / 2 + ARM_W / 2;
  const legY = LEG_H / 2;
  const legX = LEG_W / 2;

  return (
    <group ref={groupRef} position={[0, -0.15, 0]}>
      {/* Head — slightly rounded with Roblox classic proportions */}
      <mesh position={[0, headY, 0]} castShadow>
        <boxGeometry args={[HEAD_SIZE, HEAD_SIZE, HEAD_SIZE]} />
        <meshStandardMaterial color={skinColor} roughness={0.75} />
      </mesh>

      {/* Face features (simple eyes + mouth) */}
      <mesh position={[0.12, headY + 0.04, HEAD_SIZE / 2 + 0.001]}>
        <planeGeometry args={[0.08, 0.06]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[-0.12, headY + 0.04, HEAD_SIZE / 2 + 0.001]}>
        <planeGeometry args={[0.08, 0.06]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[0, headY - 0.1, HEAD_SIZE / 2 + 0.001]}>
        <planeGeometry args={[0.16, 0.035]} />
        <meshBasicMaterial color="#c4956e" />
      </mesh>

      {/* Torso */}
      <mesh position={[0, torsoY, 0]} castShadow>
        <boxGeometry args={[TORSO_W, TORSO_H, TORSO_D]} />
        <primitive object={torsoMats} attach="material" />
      </mesh>

      {/* Right arm */}
      <mesh position={[-armX, armY, 0]} castShadow>
        <boxGeometry args={[ARM_W, ARM_H, ARM_D]} />
        <primitive object={rightArmMats} attach="material" />
      </mesh>

      {/* Left arm */}
      <mesh position={[armX, armY, 0]} castShadow>
        <boxGeometry args={[ARM_W, ARM_H, ARM_D]} />
        <primitive object={leftArmMats} attach="material" />
      </mesh>

      {/* Right leg */}
      <mesh position={[-legX, legY, 0]} castShadow>
        <boxGeometry args={[LEG_W, LEG_H, LEG_D]} />
        <primitive object={rightLegMats} attach="material" />
      </mesh>

      {/* Left leg */}
      <mesh position={[legX, legY, 0]} castShadow>
        <boxGeometry args={[LEG_W, LEG_H, LEG_D]} />
        <primitive object={leftLegMats} attach="material" />
      </mesh>
    </group>
  );
}
