import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ClientApp from "./pages/ClientApp";
import NotFound from "./pages/NotFound";
import { EuromaniaScreen } from "@/components/client/EuromaniaScreen";

const queryClient = new QueryClient();

// 0 = domingo, 3 = miércoles
const isEuromaniaDay = () => {
  const d = new Date().getDay();
  return d === 0 || d === 3;
};

const App = () => {
  if (isEuromaniaDay()) {
    return <EuromaniaScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ClientApp />} />
            <Route path="/menu" element={<ClientApp />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
