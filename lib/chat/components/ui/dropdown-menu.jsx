'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils.js';

const DropdownContext = createContext({ open: false, onOpenChange: () => {}, triggerRef: { current: null } });

export function DropdownMenu({ children, open: controlledOpen, onOpenChange: controlledOnOpenChange }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const onOpenChange = controlledOnOpenChange || setInternalOpen;
  const triggerRef = useRef(null);

  return (
    <DropdownContext.Provider value={{ open, onOpenChange, triggerRef }}>
      <div className="relative">{children}</div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuTrigger({ children, asChild, ...props }) {
  const { open, onOpenChange, triggerRef } = useContext(DropdownContext);
  const handleClick = (e) => {
    e.stopPropagation();
    onOpenChange(!open);
  };
  if (asChild && children) {
    return (
      <span ref={triggerRef} onClick={handleClick} {...props}>
        {children}
      </span>
    );
  }
  return (
    <button ref={triggerRef} onClick={handleClick} {...props}>
      {children}
    </button>
  );
}

export function DropdownMenuContent({ children, className, align = 'start', side = 'bottom', sideOffset = 4, ...props }) {
  const { open, onOpenChange, triggerRef } = useContext(DropdownContext);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: side === 'bottom' ? rect.bottom + sideOffset : undefined,
      bottom: side === 'top' ? window.innerHeight - rect.top + sideOffset : undefined,
      left: align === 'start' ? rect.left : undefined,
      right: align === 'end' ? window.innerWidth - rect.right : undefined,
    });
  }, [triggerRef, side, align, sideOffset]);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    updatePosition();
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target) && triggerRef.current && !triggerRef.current.contains(e.target)) {
        onOpenChange(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    const handleScroll = () => updatePosition();
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    document.addEventListener('keydown', handleEsc);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, onOpenChange, triggerRef, updatePosition]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: pos.top,
        bottom: pos.bottom,
        left: pos.left,
        right: pos.right,
      }}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background/80 backdrop-blur-sm p-1 text-foreground shadow-lg',
        className
      )}
      {...props}
    >
      {children}
    </div>,
    document.body
  );
}

export function DropdownMenuItem({ children, className, onClick, ...props }) {
  const { onOpenChange } = useContext(DropdownContext);
  return (
    <div
      role="menuitem"
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-background focus:bg-background',
        className
      )}
      onClick={(e) => {
        onClick?.(e);
        onOpenChange(false);
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator({ className }) {
  return <div className={cn('-mx-1 my-1 h-px bg-border', className)} />;
}

export function DropdownMenuLabel({ children, className }) {
  return (
    <div className={cn('px-2 py-1.5 text-sm font-semibold', className)}>
      {children}
    </div>
  );
}

export function DropdownMenuGroup({ children }) {
  return <div>{children}</div>;
}
