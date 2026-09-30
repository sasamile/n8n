'use client';

import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';

const SLIDES = [
  {
    title: ['Todo lo que necesitas', 'para automatizar tu empresa.'],
    subtitle:
      'Diseña flujos, conecta sistemas y ejecuta agentes de IA desde un solo panel.',
  },
  {
    title: ['Workflows visuales', 'pensados para tu operación.'],
    subtitle:
      'Arrastra nodos, define reglas y deja que Zyntek corra el trabajo repetitivo.',
  },
  {
    title: ['Integraciones y agentes', 'listos para tu equipo.'],
    subtitle:
      'OpenAI, bases de datos, webhooks y más — centralizados con credenciales seguras.',
  },
] as const;

export function AuthTaglineSlider() {
  const [index, setIndex] = useState(0);
  const blockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const block = blockRef.current;
    if (!block) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.fromTo(
      block,
      { opacity: reduce ? 1 : 0, y: reduce ? 0 : 8 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
    );

    const timer = window.setTimeout(() => {
      if (reduce) {
        setIndex((i) => (i + 1) % SLIDES.length);
        return;
      }
      gsap.to(block, {
        opacity: 0,
        y: -6,
        duration: 0.25,
        ease: 'power2.in',
        onComplete: () => setIndex((i) => (i + 1) % SLIDES.length),
      });
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [index]);

  const slide = SLIDES[index];

  return (
    <div className="relative z-20 shrink-0 border-t border-slate-100 px-6 py-4">
      <div ref={blockRef} className="min-h-[88px]">
        <h2 className="text-[17px] font-semibold leading-snug tracking-tight text-slate-900">
          {slide.title[0]}
          <br />
          {slide.title[1]}
        </h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
          {slide.subtitle}
        </p>
      </div>

      <div className="mt-3 flex gap-1.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-5 bg-[#007BFF]' : 'w-1.5 bg-slate-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
