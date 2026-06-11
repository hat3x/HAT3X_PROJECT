import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";

const AppLayout = () => {
  return (
    <div className="min-h-screen bg-background gradient-mesh noise-overlay">
      <AppSidebar />
      <main className="ml-[260px] min-h-screen transition-all duration-300">
        <div className="p-8 lg:p-10 max-w-[1440px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
