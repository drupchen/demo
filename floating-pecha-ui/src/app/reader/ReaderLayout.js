'use client';

/**
 * Flex container positioning root text panel and sidebar.
 *
 * Props:
 *   children     - main content (root text)
 *   sidebar      - sidebar content (tabs + panels)
 *   sidebarOpen  - boolean controlling sidebar visibility
 */
export default function ReaderLayout({ children, sidebar, sidebarOpen }) {
  return (
    <div className="flex flex-row h-[calc(100vh-64px)] mt-16">
      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      {/* Sidebar */}
      <aside
        className="overflow-y-auto border-l transition-all duration-300 ease-in-out"
        style={{
          width: sidebarOpen ? '420px' : '0px',
          minWidth: sidebarOpen ? '420px' : '0px',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
          overflow: sidebarOpen ? 'auto' : 'hidden',
          backgroundColor: 'var(--reader-bg-surface, #F9FAFB)',
          borderColor: 'var(--reader-border, #E5E7EB)',
        }}
      >
        {sidebar}
      </aside>
    </div>
  );
}
