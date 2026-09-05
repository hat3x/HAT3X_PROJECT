import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SalonProvider } from "@/lib/salon-context";
import { AuthProvider } from "@/lib/auth";
import { AppShell, EmployeeShell, AdminShell } from "@/components/staff/AppShell";

import LoginPage from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Scan from "./pages/Scan";
import VerifyCustomer from "./pages/VerifyCustomer";
import SelectService from "./pages/SelectService";
import ConfirmVisit from "./pages/ConfirmVisit";
import VisitResult from "./pages/VisitResult";
import History from "./pages/History";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import EmployeeCalendar from "./pages/EmployeeCalendar";
import AdminEmployees from "./pages/AdminEmployees";
import AdminEmployeeCalendar from "./pages/AdminEmployeeCalendar";
import RoleRedirect from "./pages/RoleRedirect";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* SalonProvider resuelve el salón (subdominio > ?salon= > VITE_SALON_SLUG) antes de
        montar nada: hasta que no hay un salón válido, AuthProvider y las rutas no se
        renderizan (muestra splash o pantalla de error controlada). */}
    <SalonProvider>
      <AuthProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RoleRedirect />} />

            {/* Staff (common) routes */}
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/scan" element={<Scan />} />
              <Route path="/verify-customer" element={<VerifyCustomer />} />
              <Route path="/select-service" element={<SelectService />} />
              <Route path="/confirm-visit" element={<ConfirmVisit />} />
              <Route path="/visit-result" element={<VisitResult />} />
              <Route path="/history" element={<History />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Employee routes */}
            <Route element={<EmployeeShell />}>
              <Route path="/employee/calendar" element={<EmployeeCalendar />} />
              <Route path="/employee/settings" element={<Settings />} />
            </Route>

            {/* Admin routes (owner/manager) — solo lectura en esta fase */}
            <Route element={<AdminShell />}>
              {/* Agenda del salón: la vista muestra TODO el salón agrupado por profesional,
                  así que vive en una ruta propia (no bajo /employees/:id). */}
              <Route path="/admin/agenda" element={<AdminEmployeeCalendar />} />
              <Route path="/admin/employees" element={<AdminEmployees />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </AuthProvider>
    </SalonProvider>
  </QueryClientProvider>
);

export default App;
