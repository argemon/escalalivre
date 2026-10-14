import { useRef, useState, type PointerEvent, type MouseEvent } from "react";

export function useEditorDismiss(value: unknown, onClose: () => void) {
  const [initial] = useState(() => JSON.stringify(value));
  const dirty = JSON.stringify(value) !== initial;
  const press = useRef<{ x: number; y: number; id: number } | null>(null);
  const outsideClick = useRef(false);
  const requestClose = () => {
    if (!dirty || window.confirm("Você tem alterações não salvas. Deseja descartá-las e fechar?")) onClose();
  };
  return {
    requestClose,
    backdrop: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        outsideClick.current = false;
        press.current = event.target === event.currentTarget && event.button === 0 && event.isPrimary
          ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        const start = press.current;
        outsideClick.current = Boolean(start && start.id === event.pointerId && event.target === event.currentTarget && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 5);
        press.current = null;
      },
      onPointerCancel: () => { press.current = null; outsideClick.current = false; },
      onClick: (event: MouseEvent<HTMLDivElement>) => {
        const shouldClose = outsideClick.current && event.target === event.currentTarget;
        outsideClick.current = false;
        if (shouldClose) requestClose();
      },
    },
  };
}
