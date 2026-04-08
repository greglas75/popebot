'use client';

import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { cn } from '../../utils.js';

const SheetContext = createContext({ open: false, onOpenChange: () => {} });

export function Sheet({ children, open, onOpenChange }) {
  return (
    <SheetContext.Provider value={{ open, onOpenChange }}>
      {children}
    </SheetContext.Provider>
  );
}

export function SheetTrigger({ children, asChild, ...props }) {
  const { onOpenChange } = useContext(SheetContext);
  if (asChild && children) {
    return (
      <span onClick={() => onOpenChange(true)} {...props}>
        {children}
      </span>
    );
  }
  return (
    <button onClick={() => onOpenChange(true)} {...props}>
      {children}
    </button>
  );
}

export function SheetContent({ children, className, side = 'left', ...props }) {
  const { open, onOpenChange } = useContext(SheetContext);
  const touchStart = useRef(null);
  const touchCurrent = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onOpenChange]);

  const handleTouchStart = useCallback((e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touchCurrent.current = null;
    if (contentRef.current) {
      contentRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!touchStart.current) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    touchCurrent.current = { x: currentX, y: currentY };

    const deltaX = currentX - touchStart.current.x;
    const deltaY = currentY - touchStart.current.y;

    // Only handle horizontal swipes
    if (Math.abs(deltaX) < Math.abs(deltaY)) return;

    // For left sidebar: only allow swiping left (negative delta)
    // For right sidebar: only allow swiping right (positive delta)
    const offset = side === 'left' ? Math.min(0, deltaX) : Math.max(0, deltaX);
    if (offset === 0) return;

    if (contentRef.current) {
      contentRef.current.style.transform = `translateX(${offset}px)`;
    }
  }, [side]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart.current || !touchCurrent.current) {
      if (contentRef.current) {
        contentRef.current.style.transition = '';
        contentRef.current.style.transform = '';
      }
      touchStart.current = null;
      return;
    }

    const deltaX = touchCurrent.current.x - touchStart.current.x;
    const threshold = 80;

    if (contentRef.current) {
      contentRef.current.style.transition = '';
    }

    // Close if swiped far enough in the dismiss direction
    if ((side === 'left' && deltaX < -threshold) || (side === 'right' && deltaX > threshold)) {
      onOpenChange(false);
    }

    if (contentRef.current) {
      contentRef.current.style.transform = '';
    }
    touchStart.current = null;
    touchCurrent.current = null;
  }, [side, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      {/* Content */}
      <div
        ref={contentRef}
        className={cn(
          'fixed z-50 bg-background shadow-lg transition-transform',
          side === 'left' && 'inset-y-0 left-0 w-3/4 max-w-sm border-r border-border',
          side === 'right' && 'inset-y-0 right-0 w-3/4 max-w-sm border-l border-border',
          className
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ children, className }) {
  return <div className={cn('flex flex-col space-y-2 p-4', className)}>{children}</div>;
}

export function SheetTitle({ children, className }) {
  return <h2 className={cn('text-lg font-semibold text-foreground', className)}>{children}</h2>;
}

export function SheetDescription({ children, className }) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>;
}

export function SheetClose({ children, asChild, ...props }) {
  const { onOpenChange } = useContext(SheetContext);
  if (asChild && children) {
    return (
      <span onClick={() => onOpenChange(false)} {...props}>
        {children}
      </span>
    );
  }
  return (
    <button onClick={() => onOpenChange(false)} {...props}>
      {children}
    </button>
  );
}
