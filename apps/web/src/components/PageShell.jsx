import React from 'react';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

export default function PageShell({ children, hideFooter }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#0B0B0B] text-white">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      {!hideFooter && <SiteFooter />}
    </div>
  );
}
