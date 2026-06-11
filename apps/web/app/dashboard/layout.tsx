import Link from "next/link"

const NAV_LINKS = [
  { href: "/dashboard", label: "Resumen" },
  { href: "/dashboard/tasks", label: "Tareas" },
  { href: "/dashboard/checkpoints", label: "Checkpoints" },
  { href: "/dashboard/evolution", label: "Evolución" },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="min-h-screen bg-surface-1 text-text-primary">
      <nav className="border-b border-border-subtle bg-surface-2 px-6 py-3 flex items-center gap-6">
        <span className="text-purple-primary font-semibold text-sm tracking-wide">HAT3X CMD</span>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-text-secondary hover:text-text-primary text-sm transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <main className="p-6 max-w-content mx-auto">{children}</main>
    </div>
  )
}
