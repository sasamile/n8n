'use client';

import gsap from 'gsap';
import {
  Bot,
  Database,
  GitBranch,
  Layers,
  Mail,
  Shield,
  Webhook,
  Workflow,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type WaveDot = {
  key: string;
  cx: string;
  cy: string;
  r: string;
  fill: string;
  fillOpacity: string;
  accent: boolean;
};

const round = (n: number, digits = 2) => n.toFixed(digits);

const WAVE_DOTS: WaveDot[] = (() => {
  const dots: WaveDot[] = [];
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 32; col++) {
      const x = 30 + col * 23;
      const wave =
        Math.sin((col / 32) * Math.PI * 2 + row * 0.2) * 12 +
        Math.sin((col / 32) * Math.PI * 0.7) * 7;
      const y = 70 + row * 12 + wave;
      const dist = Math.hypot(col - 16, row - 6) / 18;
      const opacity = Math.max(0.05, 0.38 - dist * 0.35);
      const r = 1.1 + (1 - dist) * 1;
      const accent = col % 5 === 0 || (row + col) % 9 === 0;
      dots.push({
        key: `${row}-${col}`,
        cx: round(x),
        cy: round(y),
        r: round(r),
        fill: accent ? '#007BFF' : '#0f172a',
        fillOpacity: round(accent ? opacity * 0.9 : opacity, 3),
        accent,
      });
    }
  }
  return dots;
})();

const NODES = [
  { id: 'trigger', label: 'Trigger', icon: Zap, left: '2%', top: '8%', accent: true },
  { id: 'mail', label: 'Email', icon: Mail, left: '62%', top: '2%', accent: false },
  { id: 'http', label: 'HTTP', icon: Webhook, right: '0%', top: '30%', accent: false },
  { id: 'ai', label: 'IA', icon: Bot, right: '4%', bottom: '6%', accent: true },
  { id: 'db', label: 'Postgres', icon: Database, left: '0%', bottom: '10%', accent: false },
] as const;

const CARD_SLIDES = [
  {
    tab: 'Workflows',
    tabs: ['Workflows', 'Agentes IA'] as const,
    activeTab: 0,
    description:
      'Gestiona, automatiza y centraliza tus procesos desde un único espacio inteligente.',
    chips: [
      { icon: Zap, label: 'Automatización' },
      { icon: Layers, label: 'Analítica' },
      { icon: Bot, label: 'Asistente IA' },
      { icon: Workflow, label: 'Gestión' },
    ],
  },
  {
    tab: 'Agentes IA',
    tabs: ['Workflows', 'Agentes IA'] as const,
    activeTab: 1,
    description:
      'Orquesta agentes que responden, clasifican y ejecutan tareas con tus herramientas.',
    chips: [
      { icon: Bot, label: 'Agentes' },
      { icon: Zap, label: 'Ruteo' },
      { icon: Mail, label: 'Notificaciones' },
      { icon: Database, label: 'Memoria' },
    ],
  },
  {
    tab: 'Integraciones',
    tabs: ['Integraciones', 'Seguridad'] as const,
    activeTab: 0,
    description:
      'Conecta APIs, bases de datos, webhooks y apps sin salir del mismo canvas.',
    chips: [
      { icon: Webhook, label: 'HTTP' },
      { icon: Database, label: 'Postgres' },
      { icon: Mail, label: 'Email' },
      { icon: Layers, label: 'Redis' },
    ],
  },
  {
    tab: 'Seguridad',
    tabs: ['Integraciones', 'Seguridad'] as const,
    activeTab: 1,
    description:
      'Credenciales cifradas, ejecuciones auditables y control por equipo en un solo lugar.',
    chips: [
      { icon: Shield, label: 'Cifrado' },
      { icon: Workflow, label: 'Auditoría' },
      { icon: Layers, label: 'Roles' },
      { icon: Zap, label: 'Alertas' },
    ],
  },
] as const;

export function AuthHero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardBodyRef = useRef<HTMLDivElement>(null);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      const nodes = gsap.utils.toArray<HTMLElement>('.auth-node');
      const card = root.querySelector('.auth-product-card');
      const dots = gsap.utils.toArray<SVGCircleElement>('.auth-dot-accent');

      gsap.from(nodes, {
        opacity: 0,
        scale: 0.8,
        duration: 0.55,
        stagger: 0.06,
        ease: 'power3.out',
      });

      if (card) {
        gsap.from(card, { opacity: 0, y: 16, duration: 0.6, ease: 'power3.out' });
        gsap.to(card, {
          y: -5,
          duration: 3.2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: 0.8,
        });
      }

      nodes.forEach((node, i) => {
        gsap.to(node, {
          y: i % 2 === 0 ? -8 : 7,
          x: i % 2 === 0 ? 4 : -3,
          duration: 2.4 + i * 0.25,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: 0.3 + i * 0.08,
        });
      });

      dots.forEach((dot, i) => {
        const base = Number(dot.getAttribute('r') || 1.2);
        gsap.to(dot, {
          attr: { r: base * 1.2 },
          opacity: 0.25,
          duration: 1.4 + (i % 4) * 0.2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: (i % 8) * 0.06,
        });
      });
    }, root);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const body = cardBodyRef.current;
    if (!body) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.fromTo(
      body,
      { opacity: reduce ? 1 : 0, y: reduce ? 0 : 8 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
    );

    const timer = window.setTimeout(() => {
      if (reduce) {
        setSlideIndex((i) => (i + 1) % CARD_SLIDES.length);
        return;
      }
      gsap.to(body, {
        opacity: 0,
        y: -6,
        duration: 0.25,
        ease: 'power2.in',
        onComplete: () => setSlideIndex((i) => (i + 1) % CARD_SLIDES.length),
      });
    }, 3800);

    return () => window.clearTimeout(timer);
  }, [slideIndex]);

  const slide = CARD_SLIDES[slideIndex];

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pt-12"
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-80"
        viewBox="0 0 800 280"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {WAVE_DOTS.map((dot) => (
          <circle
            key={dot.key}
            className={dot.accent ? 'auth-dot-accent' : undefined}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            fill={dot.fill}
            fillOpacity={dot.fillOpacity}
          />
        ))}
      </svg>

      <div className="relative h-[300px] w-full max-w-[480px] shrink-0 xl:max-w-[520px]">
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line x1="16" y1="16" x2="48" y2="42" stroke="#007BFF" strokeWidth="0.35" strokeDasharray="1.5 1.2" opacity="0.35" />
          <line x1="72" y1="10" x2="52" y2="40" stroke="#94a3b8" strokeWidth="0.35" strokeDasharray="1.5 1.2" opacity="0.3" />
          <line x1="52" y1="55" x2="90" y2="40" stroke="#007BFF" strokeWidth="0.35" strokeDasharray="1.5 1.2" opacity="0.3" />
          <line x1="14" y1="84" x2="48" y2="58" stroke="#94a3b8" strokeWidth="0.35" strokeDasharray="1.5 1.2" opacity="0.28" />
          <line x1="52" y1="62" x2="86" y2="86" stroke="#007BFF" strokeWidth="0.35" strokeDasharray="1.5 1.2" opacity="0.28" />
        </svg>

        {NODES.map(({ id, label, icon: Icon, accent, ...pos }) => (
          <div
            key={id}
            style={pos}
            className={`auth-node absolute z-10 flex items-center gap-1.5 rounded-xl border bg-white px-2 py-1.5 shadow-md ${
              accent ? 'border-[#007BFF]/30' : 'border-slate-200'
            }`}
          >
            <span
              className={`flex size-7 items-center justify-center rounded-lg ${
                accent ? 'bg-[#007BFF]/10 text-[#007BFF]' : 'bg-slate-50 text-slate-700'
              }`}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="text-[10px] font-medium text-slate-700">{label}</span>
          </div>
        ))}

        <div
          className="auth-node absolute z-10 flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-md"
          style={{ left: '10%', top: '48%' }}
        >
          <GitBranch className="size-3.5 text-[#007BFF]" />
        </div>

        <div className="auth-product-card absolute top-1/2 left-1/2 z-20 w-[78%] max-w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
          <div ref={cardBodyRef}>
            <div className="mb-2.5 flex gap-3 border-b border-slate-100 text-[11px]">
              {slide.tabs.map((tab, i) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    const next = CARD_SLIDES.findIndex(
                      (s) => s.tab === tab,
                    );
                    if (next >= 0) setSlideIndex(next);
                  }}
                  className={`relative pb-1.5 font-medium transition-colors ${
                    i === slide.activeTab ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {tab}
                  {i === slide.activeTab ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#007BFF]" />
                  ) : null}
                </button>
              ))}
            </div>
            <p className="mb-2.5 min-h-[2.6rem] text-[11px] leading-relaxed text-slate-500">
              {slide.description}
            </p>
            <div className="flex flex-wrap gap-1">
              {slide.chips.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium text-slate-600"
                >
                  <Icon className="size-2.5 text-[#007BFF]" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3 flex gap-1">
            {CARD_SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Tarjeta ${i + 1}`}
                onClick={() => setSlideIndex(i)}
                className={`h-1 rounded-full transition-all ${
                  i === slideIndex ? 'w-4 bg-[#007BFF]' : 'w-1 bg-slate-300'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
