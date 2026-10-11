"use client";

import { useEffect } from "react";

// iOS (Safari and Chrome, notably iOS 26 with the floating toolbar)
// sometimes leaves the "layout viewport" — what position: fixed is pinned
// to — out of step with what is actually on screen after scrolling, so
// bottom bars (tab bar, cart bar) float mid-screen with a gap under them.
// The visual viewport always knows where the real screen bottom is: this
// publishes the gap as --vv-shift (px) on <html>, and bottom bars use the
// .vv-fixed class to move down by it. Only a downward gap is corrected
// (an on-screen keyboard also shrinks the visual viewport, and the bars
// should stay behind it), and nothing is done while pinch-zoomed.
export default function ViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const zoomed = vv.scale > 1.01;
        const gap = vv.offsetTop + vv.height - window.innerHeight;
        const shift = !zoomed && gap > 1 ? Math.round(gap) : 0;
        root.style.setProperty("--vv-shift", `${shift}px`);
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("orientationchange", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return null;
}
