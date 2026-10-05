"use client";
import { useLayoutEffect, useState, type CSSProperties, type DetailedHTMLProps, type HTMLAttributes } from 'react';

// The figure is drawn with its own tags rather than spans, so a page's broad `.panel span` rules
// can never resize or space out the digit strips.
declare module 'react' {
 namespace JSX {
  interface IntrinsicElements {
   'roll-text': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
   'roll-chars': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
   'roll-char': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
   'roll-digit': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
   'roll-strip': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
  }
 }
}

const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** The characters of a formatted figure, keyed from the right so a digit keeps its column when the figure grows or shrinks. */
export function rollingColumns(text: string) {
 const chars = [...text];
 return chars.map((char, index) => ({ key: chars.length - index, char, digit: /[0-9]/.test(char) ? Number(char) : null }));
}

/** One digit as a strip of 0–9 that slides to its value: up from 0 when it appears, up or down when it changes. */
function RollingDigit({ digit, column }: { digit: number; column: number }) {
 const [shown, setShown] = useState(0);
 useLayoutEffect(() => {
  // Two frames: the browser must paint the strip where it is before a move can be animated.
  let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setShown(digit)); });
  return () => cancelAnimationFrame(frame);
 }, [digit]);
 return <roll-digit><roll-strip style={{ transform: `translateY(-${shown * 10}%)`, '--roll-delay': `${Math.min(column, 8) * 35}ms` } as CSSProperties}>{digits.map(item => <roll-char key={item}>{item}</roll-char>)}</roll-strip></roll-digit>;
}

/** An already formatted figure (money, a percentage, a count) whose digits roll into place like an odometer and roll up or down when it changes. Signs and separators stay put; screen readers and reduced motion get the final text only. */
export function RollingText({ text }: { text: string }) {
 return <roll-text><roll-chars aria-hidden="true">{rollingColumns(text).map(({ key, char, digit }) => digit === null ? <roll-char key={`c${key}`}>{char}</roll-char> : <RollingDigit key={`d${key}`} digit={digit} column={key}/>)}</roll-chars><span className="sr-only">{text}</span></roll-text>;
}
