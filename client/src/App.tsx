import { useAuth } from "@/_core/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { isLocalMode } from "./lib/localMode";
import CommandCenterPage from "./pages/CommandCenterPage";
import CustomerDirectoryPage from "./pages/CustomerDirectoryPage";
import FinanceControlPage from "./pages/FinanceControlPage";
import LoginPage, { ChangePasswordPage } from "./pages/LoginPage";
import ManagementReportsPage from "./pages/ManagementReportsPage";
import SuperAdminSettingsPage from "./pages/SuperAdminSettingsPage";
import TicketDeskPage from "./pages/TicketDeskPage";
import LocalOverviewPage from "./pages/local/LocalOverviewPage";
import LocalTicketDeskPage from "./pages/local/LocalTicketDeskPage";
import LocalCustomerDirectoryPage from "./pages/local/LocalCustomerDirectoryPage";
import LocalFinancePage from "./pages/local/LocalFinancePage";

function SuperAdminSettingsRoute() {
  const { user } = useAuth();
  if (user?.role === "super_admin") return <SuperAdminSettingsPage/>;
  return <section className="rounded-[28px] border border-white bg-white p-8 text-center shadow-[0_10px_30px_rgba(0,0,0,.07)]"><h1 className="font-serif text-3xl tracking-[-.04em] text-ink">Restricted settings</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">Only the Super Admin can change ticket prices, fee items, expense categories, and user roles.</p></section>;
}

function OperationsRoutes() {
  const local = isLocalMode();
  return <DashboardLayout><Switch>
    <Route path="/" component={local ? LocalOverviewPage : CommandCenterPage}/>
    <Route path="/tickets" component={local ? LocalTicketDeskPage : TicketDeskPage}/>
    <Route path="/customers" component={local ? LocalCustomerDirectoryPage : CustomerDirectoryPage}/>
    <Route path="/finance" component={local ? LocalFinancePage : FinanceControlPage}/>
    <Route path="/reports" component={local ? LocalFinancePage : ManagementReportsPage}/>
    <Route path="/settings" component={local ? LocalFinancePage : SuperAdminSettingsRoute}/>
    <Route component={local ? LocalOverviewPage : CommandCenterPage}/>
  </Switch></DashboardLayout>;
}

function ProtectedApplication() {
  const { user, loading, isAuthenticated } = useAuth();
  if (isLocalMode()) return <OperationsRoutes/>;
  if (loading) return <main className="grid min-h-screen place-items-center bg-canvas"><div className="flex items-center gap-3 text-sm text-muted"><Loader2 className="animate-spin" size={18}/>Loading secure workspace…</div></main>;
  if (!isAuthenticated || !user) return <LoginPage/>;
  if (user.mustChangePassword) return <ChangePasswordPage/>;
  return <OperationsRoutes/>;
}

function Router() {
  return <Switch>
    <Route path="/login" component={LoginPage}/>
    <Route path="/change-password" component={ProtectedApplication}/>
    <Route component={ProtectedApplication}/>
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><LanguageProvider><TooltipProvider><Toaster/><Router/></TooltipProvider></LanguageProvider></ThemeProvider></ErrorBoundary>;
}
