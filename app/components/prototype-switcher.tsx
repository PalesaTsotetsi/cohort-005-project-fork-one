// PROTOTYPE — throwaway. Floating variant switcher for UI prototypes.
// ?variant= in the URL wins; otherwise the last choice (localStorage) so the
// variant survives sidebar navigation. Never renders in production builds.
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STORAGE_KEY = "prototype-variant";

export function usePrototypeVariant<K extends string>(keys: readonly K[]): K {
  const [params] = useSearchParams();
  const fromUrl = params.get("variant") as K | null;
  const [stored, setStored] = useState<K | null>(null);

  useEffect(() => {
    if (fromUrl && keys.includes(fromUrl)) {
      localStorage.setItem(STORAGE_KEY, fromUrl);
      setStored(fromUrl);
    } else {
      const s = localStorage.getItem(STORAGE_KEY) as K | null;
      if (s && keys.includes(s)) setStored(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl]);

  if (fromUrl && keys.includes(fromUrl)) return fromUrl;
  return stored ?? keys[0];
}

export function PrototypeSwitcher<K extends string>({
  variants,
  current,
  children,
}: {
  variants: Record<K, { name: string }>;
  current: K;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const keys = Object.keys(variants) as K[];

  const go = (delta: number) => {
    const i = keys.indexOf(current);
    const next = keys[(i + delta + keys.length) % keys.length];
    const p = new URLSearchParams(location.search);
    p.set("variant", next);
    localStorage.setItem(STORAGE_KEY, next);
    navigate({ pathname: location.pathname, search: p.toString() }, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]"))) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 shadow-2xl ring-1 ring-white/10">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/10" title="Previous (←)">
        <ChevronLeft className="size-4" />
      </button>
      <span className="font-mono font-semibold">
        {current} <span className="font-sans font-normal text-zinc-400">({variants[current].name})</span>
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/10" title="Next (→)">
        <ChevronRight className="size-4" />
      </button>
      {children && <div className="flex items-center gap-2 border-l border-white/15 pl-3 pr-2">{children}</div>}
    </div>
  );
}
