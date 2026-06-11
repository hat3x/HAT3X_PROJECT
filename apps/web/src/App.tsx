import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ScrollToTop from "./components/ScrollToTop";
import Index from "./pages/Index";
import Servicios from "./pages/Servicios";
import CasosDeUso from "./pages/CasosDeUso";
import Proceso from "./pages/Proceso";
import TuIdea from "./pages/TuIdea";
import Contacto from "./pages/Contacto";
import Privacidad from "./pages/Privacidad";
import Terminos from "./pages/Terminos";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
// Client portal
import ClientDashboard from "./pages/portal/ClientDashboard";
import ClientTimeline from "./pages/portal/ClientTimeline";
import ClientMilestones from "./pages/portal/ClientMilestones";
import ClientTasks from "./pages/portal/ClientTasks";
import ClientUpdates from "./pages/portal/ClientUpdates";
import ClientDocuments from "./pages/portal/ClientDocuments";
import ClientMessages from "./pages/portal/ClientMessages";
import ClientNextSteps from "./pages/portal/ClientNextSteps";
import ClientProfile from "./pages/portal/ClientProfile";
// Admin portal
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminClients from "./pages/admin/AdminClients";
import AdminProjects from "./pages/admin/AdminProjects";
import AdminPhases from "./pages/admin/AdminPhases";
import AdminTasks from "./pages/admin/AdminTasks";
import AdminUpdates from "./pages/admin/AdminUpdates";
import AdminDocuments from "./pages/admin/AdminDocuments";
import AdminMessages from "./pages/admin/AdminMessages";
import AdminNotes from "./pages/admin/AdminNotes";
import AdminApiKeys from "./pages/admin/AdminApiKeys";
import AdminProjectDetail from "./pages/admin/AdminProjectDetail";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children, requiredRole }: { children: React.ReactNode; requiredRole?: "admin" | "client" }) => {
  const { user, loading, isAdmin, isClient, mustChangePassword } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  if (requiredRole === "admin" && !isAdmin) return <Navigate to="/portal" replace />;
  if (requiredRole === "client" && !isClient && !isAdmin) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const LoginRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAdmin, mustChangePassword } = useAuth();
  if (loading) return null;
  if (user && mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user) return <Navigate to={isAdmin ? "/admin" : "/portal"} replace />;
  return <>{children}</>;
};

const ChangePasswordRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    {/* Public */}
    <Route path="/" element={<Index />} />
    <Route path="/servicios" element={<Servicios />} />
    <Route path="/casos-de-uso" element={<CasosDeUso />} />
    <Route path="/proceso" element={<Proceso />} />
    <Route path="/tu-idea" element={<TuIdea />} />
    <Route path="/contacto" element={<Contacto />} />
    <Route path="/legal/privacidad" element={<Privacidad />} />
    <Route path="/legal/terminos" element={<Terminos />} />
    <Route path="/login" element={<LoginRoute><Login /></LoginRoute>} />
    <Route path="/change-password" element={<ChangePasswordRoute><ChangePassword /></ChangePasswordRoute>} />
    {/* Client portal */}
    <Route path="/portal" element={<ProtectedRoute><ClientDashboard /></ProtectedRoute>} />
    <Route path="/portal/timeline" element={<ProtectedRoute><ClientTimeline /></ProtectedRoute>} />
    <Route path="/portal/milestones" element={<ProtectedRoute><ClientMilestones /></ProtectedRoute>} />
    <Route path="/portal/tasks" element={<ProtectedRoute><ClientTasks /></ProtectedRoute>} />
    <Route path="/portal/updates" element={<ProtectedRoute><ClientUpdates /></ProtectedRoute>} />
    <Route path="/portal/documents" element={<ProtectedRoute><ClientDocuments /></ProtectedRoute>} />
    <Route path="/portal/messages" element={<ProtectedRoute><ClientMessages /></ProtectedRoute>} />
    <Route path="/portal/next-steps" element={<ProtectedRoute><ClientNextSteps /></ProtectedRoute>} />
    <Route path="/portal/profile" element={<ProtectedRoute><ClientProfile /></ProtectedRoute>} />
    {/* Admin portal */}
    <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
    <Route path="/admin/clients" element={<ProtectedRoute requiredRole="admin"><AdminClients /></ProtectedRoute>} />
    <Route path="/admin/projects" element={<ProtectedRoute requiredRole="admin"><AdminProjects /></ProtectedRoute>} />
    <Route path="/admin/projects/:id" element={<ProtectedRoute requiredRole="admin"><AdminProjectDetail /></ProtectedRoute>} />
    <Route path="/admin/phases" element={<ProtectedRoute requiredRole="admin"><AdminPhases /></ProtectedRoute>} />
    <Route path="/admin/tasks" element={<ProtectedRoute requiredRole="admin"><AdminTasks /></ProtectedRoute>} />
    <Route path="/admin/updates" element={<ProtectedRoute requiredRole="admin"><AdminUpdates /></ProtectedRoute>} />
    <Route path="/admin/documents" element={<ProtectedRoute requiredRole="admin"><AdminDocuments /></ProtectedRoute>} />
    <Route path="/admin/messages" element={<ProtectedRoute requiredRole="admin"><AdminMessages /></ProtectedRoute>} />
    <Route path="/admin/notes" element={<ProtectedRoute requiredRole="admin"><AdminNotes /></ProtectedRoute>} />
    <Route path="/admin/api-keys" element={<ProtectedRoute requiredRole="admin"><AdminApiKeys /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ScrollToTop />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
