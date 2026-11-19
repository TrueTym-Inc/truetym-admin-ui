'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BadgePercent,
  FileText,
  Headphones,
  LayoutDashboard,
  Megaphone,
  Package,
  Settings,
  Sliders,
  TrendingDown,
  TrendingUp,
  Users,
  UsersRound,
} from 'lucide-react';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'Organisation', href: '/organisations' },
  { icon: Sliders, label: 'Feature Management', href: '/features' },
  { icon: Package, label: 'Plan Management', href: '/dashboard/plan' },
  { icon: BadgePercent, label: 'Discounts', href: '/discounts' },
  { icon: TrendingDown, label: 'Offboarding', href: '/offboarding' },
  { icon: Megaphone, label: 'Marketing', href: '/dashboard/marketing' },
  { icon: FileText, label: 'Financials', href: '/dashboard/financials' },
  { icon: Package, label: 'Product Usage', href: '/dashboard/product-usage' },
  { icon: Headphones, label: 'Support', href: '/dashboard/support' },
  { icon: TrendingUp, label: 'Forecasting', href: '/dashboard/forecasting' },
  { icon: UsersRound, label: 'User Management', href: '/users' },
  { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
];

/**
 * Picks the menu item whose href is the longest prefix of the current path, so
 * /organisations/123 keeps "Organisation" highlighted, while /dashboard/plan
 * highlights "Plan Management" rather than "Dashboard".
 */
function getActiveHref(pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of menuItems) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.length)) best = href;
  }
  return best;
}

export default function Sidebar() {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-70 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-500 text-base font-semibold text-white">
          T
        </div>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold text-black">TrueTym</h1>
          <p className="text-xs text-black/60">Business Admin</p>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === activeHref;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-black hover:bg-teal-50 hover:text-teal-700'
              }`}
            >
              <Icon
                className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-white' : 'text-black/70'}`}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Help */}
      <div className="shrink-0 border-t border-gray-200 p-3">
        <div className="rounded-lg bg-teal-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-black">Need Help?</p>
          <p className="mt-0.5 text-xs text-teal-800">Check our documentation</p>
        </div>
      </div>
    </aside>
  );
}
