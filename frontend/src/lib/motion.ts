import type { Variants } from "framer-motion";

/** Cubic-bezier must be a fixed-length tuple, not number[]. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Staggered entrance used across the nurse screens — pass the index as `custom`. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: index * 0.05, duration: 0.35, ease: EASE_OUT },
  }),
};
