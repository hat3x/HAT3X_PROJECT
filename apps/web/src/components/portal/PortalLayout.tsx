import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Hat3xLogo from "@/components/Hat3xLogo";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, FolderKanban, ListChecks, FileText, MessageSquare,
  Settings, LogOut, ChevronLeft, ChevronRight, Clock, Milestone,
  Users, Bell, StickyNote, Upload, Menu, X, Key
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
}

const clientNavItems: NavItem[] = [
  { label: "Dashboard", to: "/portal", icon: LayoutDashboard },
  { label: "Timeline", to: "/portal/timeline", icon: Clock },
  { label: "Hitos", to: "/portal/milestones", icon: Milestone },
  { label: "Tareas", to: "/portal/tasks", icon: ListChecks },
  { label: "Actualizaciones", to: "/portal/updates", icon: Bell },
  { label: "Documentos", to: "/portal/documents", icon: FileText },
  { label: "Mensajes", to: "/portal/messages", icon: MessageSquare },
  { label: "Próximos pasos", to: "/portal/next-steps", icon: FolderKanban },
  { label: "Mi perfil", to: "/portal/profile", icon: Settings },
];

const adminNavItems: NavItem[] = [
  { label: "Dashboard", to: "/admin", icon: LayoutDashboard },
  { label: "Clientes", to: "/admin/clients", icon: Users },
  { label: "Proyectos", to: "/admin/projects", icon: FolderKanban },
  { label: "Mensajes", to: "/admin/messages", icon: MessageSquare },
  { label: "API Keys", to: "/admin/api-keys", icon: Key },
];

interface PortalLayoutProps {
  children: ReactNode;
  type: "client" | "admin";
}

const PortalLayout = ({ children, type }: PortalLayoutProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, isAdmin, user } = useAuth();

  const navItems = type === "admin" ? adminNavItems : clientNavItems;

  // Fetch unread messages count
  useEffect(() => {
    if (!user) return;

    const fetchUnread = async () => {
      // Get all conversations the user has access to
      const { data: convs } = type === "admin"
        ? await supabase.from("conversations").select("id")
        : await supabase.from("conversations").select("id");
      if (!convs?.length) { setUnreadCount(0); return; }

      const convIds = convs.map(c => c.id);

      // Get read timestamps for each conversation
      const { data: reads } = await supabase
        .from("message_reads")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id)
        .in("conversation_id", convIds);

      const readMap: Record<string, string> = {};
      (reads || []).forEach(r => { readMap[r.conversation_id] = r.last_read_at; });

      // Count messages not sent by this user AND newer than last_read_at
      let total = 0;
      for (const convId of convIds) {
        let query = supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", convId)
          .neq("sender_id", user.id);

        if (readMap[convId]) {
          query = query.gt("created_at", readMap[convId]);
        }

        const { count } = await query;
        total += count || 0;
      }
      setUnreadCount(total);
    };

    fetchUnread();

    const channel = supabase
      .channel("unread-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => fetchUnread())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, type]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const isActive = (to: string) => {
    if (to === "/portal" || to === "/admin") return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  const SidebarContent = () => (
    <>
      <div className="p-4 flex items-center justify-between border-b border-border/30">
        <Link to="/" className={cn(collapsed && "hidden")}>
          <Hat3xLogo size="xs" />
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Role badge */}
      {!collapsed && (
        <div className="px-4 pt-4 pb-2">
          <span className={cn(
            "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
            type === "admin"
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-accent/20 text-accent border border-accent/30"
          )}>
            {type === "admin" ? "Admin" : "Cliente"}
          </span>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                active
                  ? "bg-primary/15 text-foreground border border-primary/20 shadow-[0_0_12px_hsl(265_100%_50%/0.08)]"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <div className="relative shrink-0">
                <Icon className={cn("w-[18px] h-[18px]", active && "text-primary")} />
                {item.icon === MessageSquare && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-accent text-accent-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Switch portal link */}
        {isAdmin && (
          <Link
            to={type === "admin" ? "/portal" : "/admin"}
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground mt-2 border-t border-border/20 pt-4"
          >
            <LayoutDashboard className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && <span>{type === "admin" ? "Portal cliente" : "Panel admin"}</span>}
          </Link>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-border/30">
        {!collapsed && profile && (
          <p className="text-xs text-muted-foreground mb-2 truncate">{profile.email}</p>
        )}
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className={cn("text-muted-foreground hover:text-foreground w-full", collapsed ? "px-2" : "justify-start")}
          size="sm"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="ml-2">Cerrar sesión</span>}
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col border-r border-border/30 bg-card/50 backdrop-blur-xl transition-all duration-300 shrink-0",
        collapsed ? "w-[68px]" : "w-[260px]"
      )}>
        <SidebarContent />
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 glass-navbar h-14 flex items-center justify-between px-4">
        <Link to="/"><Hat3xLogo size="xs" /></Link>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-foreground p-2">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-[280px] h-full bg-card border-r border-border/30 flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 lg:pt-0 pt-14">
        <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default PortalLayout;
