import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import OperationsPage from "./pages/OperationsPages";

const routes = ["/", "/reservations", "/aqua-park", "/guest-stays", "/housekeeping", "/maintenance", "/inventory", "/team", "/revenue", "/reports", "/administration"];
function Router() { return <Switch>{routes.map((path) => <Route key={path} path={path} component={OperationsPage}/>)}</Switch>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster/><DashboardLayout><Router/></DashboardLayout></TooltipProvider></ThemeProvider></ErrorBoundary>; }
