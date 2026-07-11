/**
 * The only quad → pixels mapping in the codebase (spec §2.2). Nothing else may
 * colour a quad value. If you find yourself reaching for --finding or --gap in
 * another stylesheet, you are about to break the invariant — use this instead.
 */
import type { ReactNode } from "react";
import type { Quad as QuadState } from "@/schema";
import { quadClass, quadLabel } from "@/lib/quad";
import styles from "./Quad.module.css";

interface Props {
  state: QuadState | undefined | null;
  /** The established value, rendered when `state` is a fact (yes/no). */
  children?: ReactNode;
}

export function Quad({ state, children }: Props) {
  const cls = quadClass(state);
  const showValue = cls === "fact" && children != null;
  return (
    <span className={styles[cls]}>{showValue ? children : quadLabel(state)}</span>
  );
}
