import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import NewAnalysis from "@/pages/NewAnalysis";
import AnalysisResult from "@/pages/AnalysisResult";
import DemoPreview from "@/pages/DemoPreview";
import EmailOutreach from "@/pages/EmailOutreach";
import LeadsHistory from "@/pages/LeadsHistory";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/nuevo-analisis" element={<NewAnalysis />} />
            <Route path="/analisis/:id" element={<AnalysisResult />} />
            <Route path="/demo/:id" element={<DemoPreview />} />
            <Route path="/email/:id" element={<EmailOutreach />} />
            <Route path="/leads" element={<LeadsHistory />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
