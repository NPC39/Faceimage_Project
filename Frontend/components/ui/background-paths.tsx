'use client';

import { motion } from 'framer-motion';

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${180 + i * 6}C-${
      380 - i * 5 * position
    } -${180 + i * 6} -${180 + i * 4 * position} ${120 + i * 12} ${
      120 + i * 8 * position
    } ${280 + i * 16}C${420 + i * 10 * position} ${440 + i * 20} ${
      680 + i * 12 * position
    } ${620 + i * 18} ${680 + i * 12 * position} ${620 + i * 18}`,
    strokeWidth: 0.8 + i * 0.02,
    strokeOpacity: 0.04 + (i % 6) * 0.025,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden text-zinc-400 opacity-60">
      <svg
        className="w-full h-full text-zinc-400"
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Editorial Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.strokeWidth}
            strokeOpacity={path.strokeOpacity}
            initial={{ pathLength: 0.3, opacity: 0.2 }}
            animate={{
              pathLength: [0.3, 0.7, 0.3],
              opacity: [0.2, 0.5, 0.2],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 18 + (path.id % 7) * 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export function BackgroundPaths({
  children,
  className = '',
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-zinc-950 text-zinc-100 ${className}`}>
      <div className="absolute inset-0 pointer-events-none">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
