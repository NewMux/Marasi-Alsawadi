import { useAuth } from "@/_core/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout, { permittedPath } from "./components/DashboardLayout";
import type { ComponentType } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { isLocalMode } from "./lib/localMode";
import CommandCenterPage from "./pages/CommandCenterPage";
import CustomerDirectoryPage from "./pages/CustomerDirectoryPage";
import FacilityBookingsPage from "./pages/FacilityBookingsPage";
import FinanceControlPage from "./pages/FinanceControlPage";
import LoginPage, { ChangePasswordPage } from "./pages/LoginPage";
import ManagementReportsPage from "./pages/ManagementReportsPage";
import PettyCashPage from "./pages/PettyCashPage";
import SuperAdminSettingsPage from "./pages/SuperAdminSettingsPage";
import TicketDeskPage from "./pages/TicketDeskPage";
import LocalOverviewPage from "./pages/local/LocalOverviewPage";
import LocalTicketDeskPage from "./pages/local/LocalTicketDeskPage";
import LocalCustomerDirectoryPage from "./pages/local/LocalCustomerDirectoryPage";
import LocalFinancePage from "./pages/local/LocalFinancePage";

function SuperAdminSettingsRoute() {
  const { user } = useAuth();
  if (user?.role === "super_admin" || user?.role === "admin") return <SuperAdminSettingsPage/>;
  return <section className="rounded-[28px] border border-white bg-white p-8 text-center shadow-[0_10px_30px_rgba(0,0,0,.07)]"><h1 className="font-serif text-3xl tracking-[-.04em] text-ink">Restricted settings</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">Only Admin Operations and the Super Admin can change ticket prices, fee items, expense categories, and user roles.</p></section>;
}

// PRD Round 16, item 12: a Cashier (and any role without the nav item)
// can't reach Finance pages by typing the URL either — the server already
// refuses their data, this just shows a clear message instead of errors.
function roleGuarded(path: string, Page: ComponentType) {
  return function GuardedPage() {
    const { user } = useAuth();
    if (!isLocalMode() && !permittedPath(path, user?.role)) return <section className="rounded-[28px] border border-white bg-white p-8 text-center shadow-[0_10px_30px_rgba(0,0,0,.07)]"><h1 className="font-serif text-3xl tracking-[-.04em] text-ink">Restricted</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">Your role doesn't have access to this page.</p></section>;
    return <Page/>;
  };
}
const GuardedFinanceControlPage = roleGuarded("/finance", FinanceControlPage);
const GuardedManagementReportsPage = roleGuarded("/reports", ManagementReportsPage);
const GuardedPettyCashPage = roleGuarded("/petty-cash", PettyCashPage);

function OperationsRoutes() {
  const local = isLocalMode();
  return <DashboardLayout><Switch>
    <Route path="/" component={local ? LocalOverviewPage : CommandCenterPage}/>
    <Route path="/tickets" component={local ? LocalTicketDeskPage : TicketDeskPage}/>
    <Route path="/customers" component={local ? LocalCustomerDirectoryPage : CustomerDirectoryPage}/>
    <Route path="/facility-bookings" component={local ? LocalOverviewPage : FacilityBookingsPage}/>
    <Route path="/finance" component={local ? LocalFinancePage : GuardedFinanceControlPage}/>
    <Route path="/reports" component={local ? LocalFinancePage : GuardedManagementReportsPage}/>
    <Route path="/petty-cash" component={local ? LocalFinancePage : GuardedPettyCashPage}/>
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
  // A petty cash custodian must never see any other page, nav item, or even
  // the sidebar chrome itself (PRD: "should NOT see the normal
  // sidebar/navigation ... land directly on a single dedicated screen") —
  // so this bypasses both the normal route Switch and DashboardLayout.
  if (user.role === "petty_cash") return <PettyCashPage/>;
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
