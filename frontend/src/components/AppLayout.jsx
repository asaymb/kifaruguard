import { Link, NavLink } from 'react-router-dom'

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/run', label: 'Run agents' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/audit', label: 'Audit logs' },
  { to: '/hitl', label: 'HITL queue' },
  { to: '/policies', label: 'Policies' },
]

function ShieldIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function BellIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.636 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}

export default function AppLayout({
  children,
  dark,
  onToggleDark,
  environmentLabel,
  displayName,
  pendingHitlCount,
}) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex font-sans antialiased">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm">
            <ShieldIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white leading-tight">Kifaru Guard</div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Governance</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {nav.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-200'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
          Decision audit trail for regulated agent workflows.
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 sm:h-16 shrink-0 flex items-center gap-3 px-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm sticky top-0 z-20">
          <div className="lg:hidden flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900">
              <ShieldIcon className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm truncate">Kifaru Guard</span>
          </div>
          <div className="hidden lg:block flex-1" />
          <div className="flex flex-1 lg:flex-none items-center justify-end gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
            <span
              className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide ${
                environmentLabel === 'Production'
                  ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 ring-1 ring-inset ring-blue-600/15'
                  : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 ring-1 ring-inset ring-amber-600/20'
              }`}
            >
              {environmentLabel === 'Production' ? 'Prod' : 'Dev'}
            </span>
            <div className="relative">
              <Link
                to="/hitl"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                aria-label={pendingHitlCount > 0 ? `${pendingHitlCount} pending reviews` : 'Human review queue'}
              >
                <BellIcon className="h-5 w-5" />
                {pendingHitlCount > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                    {pendingHitlCount > 9 ? '9+' : pendingHitlCount}
                  </span>
                ) : null}
              </Link>
            </div>
            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" aria-hidden />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[140px]">{displayName}</span>
            </div>
            <button
              type="button"
              onClick={onToggleDark}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {dark ? 'Light' : 'Dark'}
            </button>
          </div>
        </header>

        <div className="lg:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {nav.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
