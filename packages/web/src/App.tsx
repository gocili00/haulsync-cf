import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SuperadminSidebar } from "@/components/superadmin-sidebar";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { InstallPrompt } from "@/components/install-prompt";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck } from "lucide-react";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import DriversPage from "@/pages/drivers";
import LoadsPage from "@/pages/loads";
import PayItemsPage from "@/pages/pay-items";
import PayrollPage from "@/pages/payroll";
import AdminPage from "@/pages/admin";
import UploadLoadPage from "@/pages/upload-load";
import CompaniesPage from "@/pages/companies";
import TeamPage from "@/pages/team";
import MyPerformancePage from "@/pages/my-performance";
import ProfitabilityPage from "@/pages/profitability";
import TruckProfitabilityPage from "@/pages/truck-profitability";
import AcceptInvitePage from "@/pages/accept-invite";
import NotFound from "@/pages/not-found";
import SuperadminDashboard from "@/pages/superadmin/dashboard";
import SuperadminCompanies from "@/pages/superadmin/companies";
import CompanyDetail from "@/pages/superadmin/company-detail";
import SuperadminUsers from "@/pages/superadmin/users";
import SuperadminInvites from "@/pages/superadmin/invites";
import SuperadminAudit from "@/pages/superadmin/audit";

function getSafeHome(role: string): string {
  switch (role) {
    case "SUPERADMIN": return "/superadmin/dashboard";
    case "ADMIN": return "/";
    case "DISPATCHER": return "/";
    case "DRIVER": return "/loads";
    default: return "/";
  }
}

function RoleGuard({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) {
    return <Redirect to="/login" />;
  }
  if (!roles.includes(user.role)) {
    return <Redirect to={getSafeHome(user.role)} />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/drivers">
        <RoleGuard roles={["DISPATCHER", "ADMIN", "SUPERADMIN"]}>
          <DriversPage />
        </RoleGuard>
      </Route>
      <Route path="/loads" component={LoadsPage} />
      <Route path="/pay-items" component={PayItemsPage} />
      <Route path="/payroll" component={PayrollPage} />
      <Route path="/upload-load">
        <RoleGuard roles={["DRIVER"]}>
          <UploadLoadPage />
        </RoleGuard>
      </Route>
      <Route path="/team">
        <RoleGuard roles={["ADMIN", "SUPERADMIN"]}>
          <TeamPage />
        </RoleGuard>
      </Route>
      <Route path="/my-performance">
        <RoleGuard roles={["DISPATCHER"]}>
          <MyPerformancePage />
        </RoleGuard>
      </Route>
      <Route path="/profitability">
        <RoleGuard roles={["ADMIN", "SUPERADMIN"]}>
          <ProfitabilityPage />
        </RoleGuard>
      </Route>
      <Route path="/truck-profitability">
        <RoleGuard roles={["ADMIN", "SUPERADMIN"]}>
          <TruckProfitabilityPage />
        </RoleGuard>
      </Route>
      <Route path="/admin">
        <RoleGuard roles={["ADMIN", "SUPERADMIN"]}>
          <AdminPage />
        </RoleGuard>
      </Route>
      <Route path="/companies">
        <RoleGuard roles={["SUPERADMIN"]}>
          <CompaniesPage />
        </RoleGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function SuperadminRouter() {
  return (
    <Switch>
      <Route path="/superadmin/dashboard" component={SuperadminDashboard} />
      <Route path="/superadmin/companies/:id">
        {(params) => <CompanyDetail companyId={parseInt(params.id)} />}
      </Route>
      <Route path="/superadmin/companies" component={SuperadminCompanies} />
      <Route path="/superadmin/users" component={SuperadminUsers} />
      <Route path="/superadmin/invites" component={SuperadminInvites} />
      <Route path="/superadmin/audit" component={SuperadminAudit} />
      <Route><Redirect to="/superadmin/dashboard" /></Route>
    </Switch>
  );
}

function AuthenticatedApp() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };
  const { user } = useAuth();

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          {user?.isImpersonating && <ImpersonationBanner />}
          <header className="flex items-center gap-2 p-3 border-b h-12 flex-shrink-0 sticky top-0 z-50 bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto p-4 sm:p-6 bg-background">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function SuperadminPortal() {
  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <SuperadminSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-3 border-b h-12 flex-shrink-0 sticky top-0 z-50 bg-background">
            <SidebarTrigger data-testid="button-sa-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto p-4 sm:p-6 bg-background">
            <SuperadminRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (location === "/accept-invite") {
    return <AcceptInvitePage />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
          <Truck className="w-6 h-6 text-primary animate-pulse" />
        </div>
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (location.startsWith("/superadmin") && user.role === "SUPERADMIN") {
    return <SuperadminPortal />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
          <InstallPrompt />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
