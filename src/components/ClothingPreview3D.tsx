import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Kind = "classic_shirt" | "classic_pants" | "tshirt" | "layered_or_accessory";

/**
 * Client-only 3D preview of a generated Roblox clothing texture. react-three-fiber
 * and three.js touch `window`/`document` and crash during SSR, so the whole
 * three stack is dynamically imported on mount. While it loads (or if it fails),
 * the parent still shows the flat PNG, so the preview is purely additive.
 *
 * This is an APPROXIMATION — it maps the flat texture onto a simple humanoid so
 * users get a feel for the colors/placement in 3D. It is not Roblox's exact
 * template wrap; the downloadable PNG remains the real upload asset.
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
    <Canvas camera={{ position: [0, 0.2, 4.4], fov: 42 }} dpr={[1, 2]}>
      <color attach="background" args={["#0e0f14"]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} />
      <Avatar imageUrl={imageUrl} kind={kind} THREE={THREE} />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={1.5}
        minPolarAngle={Math.PI / 2.6}
        maxPolarAngle={Math.PI / 1.8}
      />
    </Canvas>
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

  const skinColor = "#e8c9a6";
  const defaultBaseColor = "#333b45";

  // Coordinates mapping on Roblox template (585x559 canvas)
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
    fallbackColor: string
  ) => {
    if (!baseTexture) {
      return Array(6)
        .fill(null)
        .map(() => new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.8 }));
    }

    const order = [coords.right, coords.left, coords.top, coords.bottom, coords.front, coords.back];

    return order.map((face) => {
      const [x, y, w, h] = face;
      const t = baseTexture.clone();
      t.repeat.set(w / 585, h / 559);
      t.offset.set(x / 585, 1.0 - (y + h) / 559);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.05 });
    });
  };

  // Generate materials for torso, left arm, right arm, left leg, right leg
  let torsoMats;
  let rightArmMats;
  let leftArmMats;
  let rightLegMats;
  let leftLegMats;

  if (kind === "classic_shirt" && tex) {
    torsoMats = getMaterials(tex, TORSO_COORDS, defaultBaseColor);
    rightArmMats = getMaterials(tex, RIGHT_ARM_COORDS, defaultBaseColor);
    leftArmMats = getMaterials(tex, LEFT_ARM_COORDS, defaultBaseColor);
    rightLegMats = Array(6).fill(new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 }));
    leftLegMats = Array(6).fill(new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 }));
  } else if (kind === "classic_pants" && tex) {
    torsoMats = getMaterials(tex, TORSO_COORDS, defaultBaseColor);
    rightArmMats = Array(6).fill(new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 }));
    leftArmMats = Array(6).fill(new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 }));
    rightLegMats = getMaterials(tex, RIGHT_ARM_COORDS, defaultBaseColor);
    leftLegMats = getMaterials(tex, LEFT_ARM_COORDS, defaultBaseColor);
  } else if ((kind === "tshirt" || kind === "layered_or_accessory") && tex) {
    // Show full graphic on Torso Front only
    const torsoFrontTex = tex.clone(); // use whole image
    const frontMat = new THREE.MeshStandardMaterial({ map: torsoFrontTex, roughness: 0.7 });
    const sideMat = new THREE.MeshStandardMaterial({ color: defaultBaseColor, roughness: 0.8 });

    torsoMats = [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat];
    rightArmMats = Array(6).fill(new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 }));
    leftArmMats = Array(6).fill(new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 }));
    rightLegMats = Array(6).fill(new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 }));
    leftLegMats = Array(6).fill(new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 }));
  } else {
    // Fallback: neutral colors
    const neutralMat = new THREE.MeshStandardMaterial({ color: defaultBaseColor, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });

    torsoMats = Array(6).fill(neutralMat);
    rightArmMats = Array(6).fill(skinMat);
    leftArmMats = Array(6).fill(skinMat);
    rightLegMats = Array(6).fill(skinMat);
    leftLegMats = Array(6).fill(skinMat);
  }

  return (
    <group position={[0, -0.2, 0]}>
      {/* head */}
      <mesh position={[0, 1.95, 0]}>
        <boxGeometry args={[0.62, 0.62, 0.62]} />
        <meshStandardMaterial color={skinColor} roughness={0.8} />
      </mesh>

      {/* torso */}
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[1.15, 1.25, 0.6]} />
        <primitive object={torsoMats} attach="material" />
      </mesh>

      {/* right arm */}
      <mesh position={[-0.78, 1.0, 0]}>
        <boxGeometry args={[0.34, 1.2, 0.36]} />
        <primitive object={rightArmMats} attach="material" />
      </mesh>

      {/* left arm */}
      <mesh position={[0.78, 1.0, 0]}>
        <boxGeometry args={[0.34, 1.2, 0.36]} />
        <primitive object={leftArmMats} attach="material" />
      </mesh>

      {/* right leg */}
      <mesh position={[-0.3, 0.05, 0]}>
        <boxGeometry args={[0.42, 1.15, 0.42]} />
        <primitive object={rightLegMats} attach="material" />
      </mesh>

      {/* left leg */}
      <mesh position={[0.3, 0.05, 0]}>
        <boxGeometry args={[0.42, 1.15, 0.42]} />
        <primitive object={leftLegMats} attach="material" />
      </mesh>
    </group>
  );
}
