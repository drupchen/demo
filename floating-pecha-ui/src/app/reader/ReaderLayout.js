'use client';

import { forwardRef } from 'react';

const ReaderLayout = forwardRef(function ReaderLayout({ children, sidebar, sidebarOpen }, ref) {
  return (
    <div className="flex flex-row h-[calc(100vh-64px)] mt-16">
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
