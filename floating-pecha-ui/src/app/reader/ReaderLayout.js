'use client';

import { forwardRef, useCallback, useRef, useState } from 'react';

// Drag-to-dismiss threshold for the mobile bottom sheet (px).
const SHEET_DISMISS_PX = 90;

const ReaderLayout = forwardRef(function ReaderLayout(
  {
    children,
    sidebar,
    sidebarOpen,
    leftSidebar,
    leftOpen,
    leftWidth,
    onLeftResize,
    showLeftReveal,
    onRevealLeft,
    isMobile = false,
    onCloseLeft,
    onCloseSidebar,
  },
  ref
) {
  // Mobile bottom-sheet drag state. A downward drag that starts on the grab
  // handle ([data-sheet-drag-handle]) moves the sheet with the finger; release
  // past SHEET_DISMISS_PX dismisses it, otherwise it snaps back open.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef(null);

  const onSheetTouchStart = useCallback((e) => {
    if (!e.target.closest('[data-sheet-drag-handle]')) return;
    dragStartRef.current = e.touches[0].clientY;
    setDragging(true);
    setDragY(0);
  }, []);

  const onSheetTouchMove = useCallback((e) => {
    if (dragStartRef.current === null) return;
    setDragY(Math.max(0, e.touches[0].clientY - dragStartRef.current));
  }, []);

  const onSheetTouchEnd = useCallback(() => {
    if (dragStartRef.current === null) return;
    const shouldClose = dragY > SHEET_DISMISS_PX;
    dragStartRef.current = null;
    setDragging(false);
    setDragY(0);
    if (shouldClose) onCloseSidebar?.();
  }, [dragY, onCloseSidebar]);
  // ----------------------------------------------------------------
  // Mobile: single-column text with off-canvas overlays.
  // The TOC slides in from the left as a drawer; the player/info panel
  // slides up from the bottom as a sheet. Neither occupies layout flow,
  // so the transcript text gets the full width and scrolls on its own.
  // ----------------------------------------------------------------
  if (isMobile) {
    return (
      <div className="flex flex-row h-[calc(100dvh-64px)] mt-16 relative">
        {/* No left sapche sidebar/drawer on mobile — the floating tornado button
            (in page.js) opens the fullscreen Sapche study view directly. */}

        {/* Main scrollable text — full width */}
        <div
          ref={ref}
          data-reader-scroll
          className="flex-1 overflow-y-auto"
          style={{ overscrollBehavior: 'contain' }}
        >
          {children}
        </div>

        {/* Player/Info bottom sheet + backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-[80] bg-black/40"
            onClick={onCloseSidebar}
            aria-hidden="true"
          />
        )}
        <aside
          onTouchStart={onSheetTouchStart}
          onTouchMove={onSheetTouchMove}
          onTouchEnd={onSheetTouchEnd}
          className="fixed bottom-0 left-0 right-0 z-[85] overflow-y-auto border-t r-sidebar rounded-t-2xl"
          style={{
            height: '82vh',
            transform: dragging
              ? `translateY(${dragY}px)`
              : sidebarOpen
                ? 'translateY(0)'
                : 'translateY(100%)',
            transition: dragging ? 'none' : 'transform .3s ease',
            overscrollBehavior: 'contain',
          }}
        >
          {sidebar}
        </aside>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // Desktop: resizable three-column layout (unchanged).
  // ----------------------------------------------------------------
  return (
    <div className="flex flex-row h-[calc(100vh-64px)] mt-16 relative">
      <aside
        className="overflow-y-auto border-r r-sidebar relative"
        style={{
          width: leftOpen ? leftWidth : 0,
          minWidth: leftOpen ? leftWidth : 0,
          transition: 'width .2s ease',
          overflow: leftOpen ? 'auto' : 'hidden',
        }}
      >
        {leftSidebar}
        {leftOpen && (
          <div
            onMouseDown={onLeftResize}
            className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-black/10"
          />
        )}
      </aside>

      {showLeftReveal && (
        <button
          type="button"
          onClick={onRevealLeft}
          title="Show contents"
          aria-label="Show contents"
          className="h-full w-8 flex-shrink-0 border-r r-sidebar r-text-muted r-hover-accent hover:bg-black/5 transition-colors flex items-start justify-center pt-3"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18" />
            <path d="m14 9 3 3-3 3" />
          </svg>
        </button>
      )}

      <div ref={ref} data-reader-scroll className="flex-1 overflow-y-auto">
        {children}
      </div>

      <aside
        className="overflow-y-auto border-l transition-all duration-300 ease-in-out r-sidebar"
        style={{
          width: sidebarOpen ? '420px' : '0px',
          minWidth: sidebarOpen ? '420px' : '0px',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
          overflow: sidebarOpen ? 'auto' : 'hidden',
        }}
      >
        {sidebar}
      </aside>
    </div>
  );
});

export default ReaderLayout;
