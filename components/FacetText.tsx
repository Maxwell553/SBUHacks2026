"use client";
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ElementType, ReactNode } from "react";

/**
 * Gentle letter-by-letter reveal for short display headings set in Facet.
 * Respects prefers-reduced-motion (renders static text).
 */
export function FacetText({
  text,
  as = "h1",
  delay = 0,
  stagger = 0.028,
  className = "display",
  style,
  accentWords = [],
}: {
  text: string;
  as?: ElementType;
  delay?: number;
  stagger?: number;
  className?: string;
  style?: CSSProperties;
  accentWords?: string[];
}) {
  const reduce = useReducedMotion();
  const Tag = as;
  let i = 0;
  const words = text.split(" ");
  return (
    <Tag className={className} style={style} aria-label={text}>
      {words.map((word, wi) => (
        <span
          key={wi}
          aria-hidden="true"
          style={{ display: "inline-block", whiteSpace: "nowrap" }}
          className={accentWords.includes(word) ? "accent" : undefined}
        >
          {Array.from(word).map((ch) => {
            const d = delay + i++ * stagger;
            return (
              <motion.span
                key={`${wi}-${i}`}
                style={{ display: "inline-block", transformOrigin: "50% 100%" }}
                initial={reduce ? false : { opacity: 0, y: "0.3em", rotateX: -35 }}
                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: d, duration: 0.6, ease: [0.25, 0.8, 0.25, 1] }}
              >
                {ch}
              </motion.span>
            );
          })}
          {wi < words.length - 1 ? <span style={{ display: "inline-block", width: "0.3em" }} /> : null}
        </span>
      ))}
    </Tag>
  );
}

/** Soft fade + rise for blocks, triggered on scroll. */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ delay, duration: 0.7, ease: [0.25, 0.8, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}
