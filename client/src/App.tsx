import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { isPublicDemoMode } from "./lib/demoMode";
import DemoOperationsPage from "./pages/DemoOperationsPage";
import ERPOperationsPage from "./pages/ERPOperationsPage";

const routes = ["/", "/reservations", "/tickets", "/aqua-park", "/guest-stays", "/housekeeping", "/maintenance", "/inventory", "/team", "/revenue", "/reports", "/administration"];
function Router() { const Page = isPublicDemoMode() ? DemoOperationsPage : ERPOperationsPage; return <Switch>{routes.map((path) => <Route key={path} path={path} component={Page}/>)}</Switch>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster/><DashboardLayout><Router/></DashboardLayout></TooltipProvider></ThemeProvider></ErrorBoundary>; }
