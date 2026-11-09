import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import {
  LayoutDashboard, Users2, MapPinned, FileText, ClipboardList, Building2,
  LogOut, Menu, X, ShieldCheck, Gavel, Handshake, ScrollText, LifeBuoy,
  UsersRound, Network, Scale,
  CalendarCheck, Wallet, Receipt, Package, Boxes, ShoppingCart,
  Megaphone, BarChart3, Bot, Palette, Crown,
} from 'lucide-react';

/**
 * Application shell.
 * White-label: the tenant's own name, colour and logo are applied here, so a
 * customer-branded instance uses the same code path (Part 6). Navigation items
 * are filtered by permission — the server is still the authority.
 */
const NAV: Array<{ to: string; label: string; icon: typeof LayoutDashboard; perm: string | null; permAny?: string[] }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: null },
  { to: '/leads', label: 'Leads', icon: Users2, perm: 'lead:read' },
  { to: '/surveys', label: 'Surveys', icon: ClipboardList, perm: 'survey:read' },
  { to: '/quotations', label: 'Quotations', icon: FileText, perm: 'quotation:read' },
  // 'tender:read:own' also grants the screen — the server narrows the rows.
  { to: '/tenders', label: 'Tenders', icon: Gavel, perm: 'tender:read', permAny: ['tender:read:own'] },
  { to: '/clients', label: 'Clients', icon: Handshake, perm: 'client:read' },
  { to: '/contracts', label: 'Contracts', icon: ScrollText, perm: 'contract:read' },
  { to: '/client-care', label: 'Client Care', icon: LifeBuoy, perm: 'complaint:read' },
  { to: '/employees', label: 'Employees', icon: UsersRound, perm: 'employee:read' },
  { to: '/workforce', label: 'Workforce', icon: Network, perm: 'allocation:read', permAny: ['manpower:read'] },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck, perm: 'attendance:read' },
  { to: '/payroll', label: 'Payroll', icon: Wallet, perm: 'payroll:read' },
  { to: '/statutory', label: 'Statutory', icon: Scale, perm: 'statutory:read' },
  { to: '/finance', label: 'Finance', icon: Receipt, perm: 'finance:read', permAny: ['invoice:read','finance:read','bank:read'] },
  { to: '/assets', label: 'Assets', icon: Package, perm: 'asset:read' },
  { to: '/stock', label: 'Stock', icon: Boxes, perm: 'stock:read' },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, perm: 'purchase_order:read' },
  { to: '/marketing', label: 'Marketing', icon: Megaphone, perm: 'marketing:contact:read', permAny: ['marketing:campaign:read','social:read'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'report:read', permAny: ['mom:read','daily_report:read'] },
  { to: '/ai', label: 'AI Assistant', icon: Bot, perm: 'ai:read' },
  { to: '/creative', label: 'Creative Studio', icon: Palette, perm: 'creative:read' },
  { to: '/platform', label: 'Platform', icon: Crown, perm: null }, // platform guard is inside controller (shows empty if not platform_admin)
  { to: '/organisation', label: 'Organisation', icon: Building2, perm: 'org:read' },
  { to: '/users', label: 'Users & Roles', icon: ShieldCheck, perm: 'user:read' },
  { to: '/sites', label: 'Sites', icon: MapPinned, perm: 'org:read' },
];

export default function Shell() {
  const { me, logout, can } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const brand = me?.tenant.branding;
  const primary = brand?.primaryColor || '#e9682d';
  const navy = brand?.secondaryColor || '#18212b';
  const name = me?.tenant.displayName || 'UFMS Business Management Suite';

  const items = NAV.filter((n) => !n.perm || can(n.perm) || (n.permAny ?? []).some((p) => can(p)));

  const onLogout = async () => { await logout(); nav('/login'); };

  return (
    <div className="min-h-screen flex" style={{ ['--brand' as never]: primary }}>
      {/* mobile overlay */}
      {open && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed lg:static z-30 w-64 shrink-0 min-h-screen text-white flex flex-col transition-transform
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ backgroundColor: navy }}
      >
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg grid place-items-center font-black text-white shrink-0"
               style={{ backgroundColor: primary }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight truncate">{name}</div>
            <div className="text-[11px] text-white/50 truncate">Business Management Suite</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition
                 ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
            >
              <Icon size={17} /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="px-2 pb-2">
            <div className="text-sm font-semibold truncate">{me?.name}</div>
            <div className="text-[11px] text-white/50 truncate">{me?.roles.join(', ')}</div>
          </div>
          <button onClick={onLogout}
                  className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="bg-white border-b border-navy-100 px-4 lg:px-8 h-14 flex items-center gap-3 sticky top-0 z-10">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="text-sm text-navy-500">
            {me?.tenant.whiteLabel ? 'White-label workspace' : 'UFMS workspace'}
            <span className="mx-2 text-navy-300">·</span>
            <span className="font-mono text-xs">{me?.tenant.slug}</span>
          </div>
        </header>
        <main className="p-4 lg:p-8 max-w-[1400px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
