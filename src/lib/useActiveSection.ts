import { useEffect, useState } from "react";

/** Which of the given section ids is being read: the last one whose top has passed the upper third of the viewport.
 *  Listens to scrolling anywhere (capture phase), so it works inside any scrolling column and after a jump. */
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join("|");
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.3;
      let cur: string | null = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) cur = id;
      }
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    update();
    return () => { document.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, [key]);
  return active;
}
