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
  const mat = tex
    ? { map: tex }
    : { color: "#5b6472" };

  const isPants = kind === "classic_pants";

  // Simple blocky humanoid. Skin parts neutral; clothed parts get the texture.
  return (
    <group position={[0, -0.2, 0]}>
      {/* head */}
      <mesh position={[0, 1.95, 0]}>
        <boxGeometry args={[0.62, 0.62, 0.62]} />
        <meshStandardMaterial color="#e8c9a6" roughness={0.8} />
      </mesh>

      {/* torso */}
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[1.15, 1.25, 0.6]} />
        {isPants ? (
          <meshStandardMaterial color="#5b6472" roughness={0.7} />
        ) : (
          <meshStandardMaterial {...mat} roughness={0.7} metalness={0.05} />
        )}
      </mesh>

      {/* arms */}
      {[-0.78, 0.78].map((x) => (
        <mesh key={x} position={[x, 1.0, 0]}>
          <boxGeometry args={[0.34, 1.2, 0.36]} />
          {isPants ? (
            <meshStandardMaterial color="#e8c9a6" roughness={0.8} />
          ) : (
            <meshStandardMaterial {...mat} roughness={0.7} />
          )}
        </mesh>
      ))}

      {/* legs */}
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.05, 0]}>
          <boxGeometry args={[0.42, 1.15, 0.42]} />
          {isPants ? (
            <meshStandardMaterial {...mat} roughness={0.7} />
          ) : (
            <meshStandardMaterial color="#3a4150" roughness={0.8} />
          )}
        </mesh>
      ))}
    </group>
  );
}
