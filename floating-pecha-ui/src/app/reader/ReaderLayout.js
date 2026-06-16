'use client';

import { forwardRef } from 'react';

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
  },
  ref
) {
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
            style={{ transform: "scaleX(-1)" }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
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
