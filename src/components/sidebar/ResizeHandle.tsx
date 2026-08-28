'use client';

import React, { useCallback, useRef } from 'react';

interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ onResize }) => {
  const lastX = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      lastX.current = e.clientX;
      e.currentTarget.setPointerCapture(e.pointerId);

      const controller = new AbortController();
      const { signal } = controller;

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - lastX.current;
        lastX.current = moveEvent.clientX;
        onResize(delta);
      };

      window.addEventListener('pointermove', handleMove, { signal });
      window.addEventListener('pointerup', () => controller.abort(), { signal });
      window.addEventListener('pointercancel', () => controller.abort(), { signal });
    },
    [onResize],
  );

  return (
    <div
      onPointerDown={handlePointerDown}
      className="w-1 shrink-0 cursor-col-resize touch-none bg-zinc-800 transition-colors hover:bg-indigo-500/40 active:bg-indigo-500/60"
      role="separator"
      aria-orientation="vertical"
    />
  );
};

export default ResizeHandle;
