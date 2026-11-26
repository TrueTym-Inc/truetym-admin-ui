'use client';

import Navbar from '@/components/shared/Navbar';
import Sidebar from '@/components/shared/Sidebar';

export default function AdminContentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fcfcf9]">
      <Sidebar />
      <div className="ml-70 flex min-h-screen min-w-0 flex-col">
        <Navbar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
