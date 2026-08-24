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

const routes = ["/tickets", "/finance"];
function AuthenticatedRouter() {
  const Page = isPublicDemoMode() ? DemoOperationsPage : ERPOperationsPage;
  return <DashboardLayout><Switch>{routes.map((path) => <Route key={path} path={path} component={Page}/>)}<Route path="/gate" component={GateScannerPage}/><Route component={Page}/></Switch></DashboardLayout>;
}
function Router() {
  return <Switch><Route path="/ticket/:token" component={PublicTicketPage}/><Route component={AuthenticatedRouter}/></Switch>;
}
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>; }
