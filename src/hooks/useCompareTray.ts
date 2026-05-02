import { useCallback, useEffect, useState } from "react";

export interface CompareEntity {
  pub_id: string;
  kind: "artist" | "track" | "writer" | "producer";
  name: string;
  subtitle?: string;
}

const KEY = "publisting-compare-tray";
const MAX = 4;

function read(): CompareEntity[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as CompareEntity[]; }
  catch { return []; }
}

function write(v: CompareEntity[]) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent("publisting-compare-changed"));
}

export function useCompareTray() {
  const [items, setItems] = useState<CompareEntity[]>(() => read());

  useEffect(() => {
    const handler = () => setItems(read());
    window.addEventListener("publisting-compare-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("publisting-compare-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const add = useCallback((e: CompareEntity) => {
    const cur = read();
    if (cur.find((x) => x.pub_id === e.pub_id)) return false;
    if (cur.length >= MAX) return false;
    write([...cur, e]);
    return true;
  }, []);

  const remove = useCallback((pub_id: string) => {
    write(read().filter((x) => x.pub_id !== pub_id));
  }, []);

  const clear = useCallback(() => write([]), []);
  const has = useCallback((pub_id: string) => read().some((x) => x.pub_id === pub_id), []);

  return { items, add, remove, clear, has, max: MAX };
}