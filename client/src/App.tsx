import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { isPublicDemoMode } from "./lib/demoMode";
import DemoOperationsPage from "./pages/DemoOperationsPage";
import ERPOperationsPage from "./pages/ERPOperationsPage";
import GateScannerPage from "./pages/GateScannerPage";
import PublicTicketPage from "./pages/PublicTicketPage";
import CommandCenterPage from "./pages/CommandCenterPage";
import CustomerDirectoryPage from "./pages/CustomerDirectoryPage";
import WorkbookMigrationPage from "./pages/WorkbookMigrationPage";
import OperationsPage from "./pages/OperationsPages";

const legacyPaths = ["/reservations", "/guest-stays", "/aqua-park", "/housekeeping", "/maintenance", "/inventory", "/team", "/revenue", "/reports", "/administration"];

function AuthenticatedRouter() {
  const demo = isPublicDemoMode();
  const demoPage = DemoOperationsPage;
  const corePage = demo ? DemoOperationsPage : ERPOperationsPage;
  const legacyPage = demo ? DemoOperationsPage : OperationsPage;
  return <DashboardLayout><Switch>
    <Route path="/" component={demo ? demoPage : CommandCenterPage}/>
    <Route path="/tickets" component={corePage}/>
    <Route path="/finance" component={corePage}/>
    <Route path="/customers" component={demo ? demoPage : CustomerDirectoryPage}/>
    <Route path="/migration" component={demo ? demoPage : WorkbookMigrationPage}/>
    <Route path="/gate" component={demo ? demoPage : GateScannerPage}/>
    {legacyPaths.map((path) => <Route key={path} path={path} component={legacyPage}/>)}
    <Route component={demo ? demoPage : CommandCenterPage}/>
  </Switch></DashboardLayout>;
}

function Router() { return <Switch><Route path="/ticket/:token" component={PublicTicketPage}/><Route component={AuthenticatedRouter}/></Switch>; }

export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>; }
