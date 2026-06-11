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
          className="r-toc-reveal"
          onClick={onRevealLeft}
          title="Show contents"
          aria-label="Show contents"
        >
          contents »
        </button>
      )}

      <div ref={ref} className="flex-1 overflow-y-auto">
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
