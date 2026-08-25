import { useAuth } from "@/_core/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { isPublicDemoMode } from "./lib/demoMode";
import CommandCenterPage from "./pages/CommandCenterPage";
import CustomerDirectoryPage from "./pages/CustomerDirectoryPage";
import DemoOperationsPage from "./pages/DemoOperationsPage";
import ERPOperationsPage from "./pages/ERPOperationsPage";
import GateScannerPage from "./pages/GateScannerPage";
import LoginPage, { ChangePasswordPage } from "./pages/LoginPage";
import PublicTicketPage from "./pages/PublicTicketPage";
import SuperAdminSettingsPage from "./pages/SuperAdminSettingsPage";
import WorkbookMigrationPage from "./pages/WorkbookMigrationPage";

function SuperAdminSettingsRoute() {
  const { user } = useAuth();
  if (user?.role === "super_admin") return <SuperAdminSettingsPage/>;
  return <section className="rounded-[28px] border border-white bg-white p-8 text-center shadow-[0_10px_30px_rgba(0,0,0,.07)]"><h1 className="font-serif text-3xl tracking-[-.04em] text-ink">Restricted settings</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">Only the Super Admin can change ticket prices, fee items, expense categories, and user roles.</p></section>;
}

function OperationsRoutes() {
  const demo = isPublicDemoMode();
  const demoPage = DemoOperationsPage;
  const corePage = demo ? DemoOperationsPage : ERPOperationsPage;
  return <DashboardLayout><Switch>
    <Route path="/" component={demo ? demoPage : CommandCenterPage}/>
    <Route path="/tickets" component={corePage}/>
    <Route path="/finance" component={corePage}/>
    <Route path="/customers" component={demo ? demoPage : CustomerDirectoryPage}/>
    <Route path="/settings" component={demo ? demoPage : SuperAdminSettingsRoute}/>
    <Route path="/migration" component={demo ? demoPage : WorkbookMigrationPage}/>
    <Route path="/gate" component={demo ? demoPage : GateScannerPage}/>
    <Route component={demo ? demoPage : CommandCenterPage}/>
  </Switch></DashboardLayout>;
}

function ProtectedApplication() {
  const { user, loading, isAuthenticated } = useAuth();
  if (isPublicDemoMode()) return <OperationsRoutes/>;
  if (loading) return <main className="grid min-h-screen place-items-center bg-canvas"><div className="flex items-center gap-3 text-sm text-muted"><Loader2 className="animate-spin" size={18}/>Loading secure workspace…</div></main>;
  if (!isAuthenticated || !user) return <LoginPage/>;
  if (user.mustChangePassword) return <ChangePasswordPage/>;
  return <OperationsRoutes/>;
}

function Router() {
  return <Switch>
    <Route path="/ticket/:token" component={PublicTicketPage}/>
    <Route path="/login" component={LoginPage}/>
    <Route path="/change-password" component={ProtectedApplication}/>
    <Route component={ProtectedApplication}/>
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
