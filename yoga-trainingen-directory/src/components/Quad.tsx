/**
 * The only quad → pixels mapping in the codebase (spec §2.2). Nothing else may
 * colour a quad value. If you find yourself reaching for --finding or --gap in
 * another stylesheet, you are about to break the invariant — use this instead.
 */
import type { ReactNode } from "react";
import type { Quad as QuadState } from "@/schema";
import { quadClass, quadLabel, showsValue } from "@/lib/quad";
import styles from "./Quad.module.css";

interface Props {
  state: QuadState | undefined | null;
  /** The established value, rendered when `state` is a fact (yes/no). */
  children?: ReactNode;
}

/**
 * Nothing is decided here. The class comes from quadClass(), the label from
 * quadLabel(), and the one branch — value or state word — from showsValue(), all
 * of them pure and all of them tested. This component is the wire between them
 * and the DOM, and the tests reach every decision it makes without rendering it.
 *
 * `styles[cls]` is the chokepoint the whole model narrows to: rename `.gap` in
 * Quad.module.css and `className` becomes `undefined` — the recessive italic that
 * stops a gap in OUR research from reading as a fact about a named business
 * silently disappears. Quad.test.ts holds the stylesheet to the three classes.
 */
export function Quad({ state, children }: Props) {
  const cls = quadClass(state);
  return (
    <span className={styles[cls]}>
      {showsValue(state, children != null) ? children : quadLabel(state)}
    </span>
  );
}
