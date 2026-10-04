"use client";

import { useEffect, useRef, useState } from 'react';
import { isPreviewReady, previewOpen, previewSize, previewSource } from '@/lib/app-preview';
import styles from './app-preview.module.css';

type Props = {
 /** The screen to show; changing it moves the preview there. */
 path?: string;
 /** Screens to step through in turn, like a video of the app; ignored for people who prefer reduced motion. */
 tour?: readonly string[];
 /** Milliseconds on each tour screen. */
 interval?: number;
 /** Load straight away (above the fold) rather than when scrolled near. */
 eager?: boolean;
 /** The window size the app is laid out at before scaling; narrower windows read larger in a small space. */
 size?: { width: number; height: number };
 className?: string;
};

/** The real app, in its sample workspace, inside a window frame and scaled to fit. It cannot be clicked or focused:
 * it shows the product rather than standing in for it. A preview inside a preview never loads. */
export function AppPreview({ path = '/', tour, interval = 4200, eager = false, size = previewSize, className }: Props) {
 const box = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
 // Rendered only in a browser that is not itself a preview, so the server sends no frame and frames never nest.
 const [show, setShow] = useState(false), [ready, setReady] = useState(false), [scale, setScale] = useState(0), [step, setStep] = useState(0);
 useEffect(() => { if (window.self === window.top) setShow(true); }, []);
 useEffect(() => {
  const node = box.current;
  if (!show || !node) return;
  const fit = () => setScale(node.clientWidth / size.width);
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(node);
  return () => observer.disconnect();
 }, [show, size.width]);
 useEffect(() => {
  const listen = (event: MessageEvent) => { if (event.source === frame.current?.contentWindow && event.origin === window.location.origin && isPreviewReady(event.data)) setReady(true); };
  window.addEventListener('message', listen);
  return () => window.removeEventListener('message', listen);
 }, []);
 // The tour only runs while the preview is on screen and motion is welcome.
 useEffect(() => {
  const node = box.current;
  if (!tour?.length || !ready || !node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let timer: ReturnType<typeof setInterval> | undefined;
  const observer = new IntersectionObserver(([entry]) => {
   clearInterval(timer);
   if (entry?.isIntersecting) timer = setInterval(() => setStep(current => (current + 1) % tour.length), interval);
  }, { threshold: .25 });
  observer.observe(node);
  return () => { observer.disconnect(); clearInterval(timer); };
 }, [tour, ready, interval]);
 const target = tour?.length ? tour[step % tour.length] : path;
 useEffect(() => { if (ready) frame.current?.contentWindow?.postMessage(previewOpen(target), window.location.origin); }, [ready, target]);
 return <div className={className ? `${styles.window} ${className}` : styles.window} aria-hidden="true">
  <div className={styles.bar}><i/><i/><i/></div>
  <div ref={box} className={styles.screen} style={{ aspectRatio: `${size.width} / ${size.height}` }}>
   {show && <iframe ref={frame} src={previewSource} title="" tabIndex={-1} loading={eager ? 'eager' : 'lazy'} data-ready={ready || undefined} className={styles.frame} style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}/>}
  </div>
 </div>;
}
