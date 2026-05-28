import { useEffect, useState } from "react";

type Ripple = { id: number; x: number; y: number };

export function ClickRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  useEffect(() => {
    let counter = 0;
    const onPointerDown = (e: PointerEvent) => {
      const id = ++counter;
      setRipples((prev) => [...prev, { id, x: e.clientX, y: e.clientY }]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 650);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      {ripples.map((r) => (
        <span key={r.id} className="click-ripple" style={{ left: r.x, top: r.y }} />
      ))}
    </div>
  );
}
