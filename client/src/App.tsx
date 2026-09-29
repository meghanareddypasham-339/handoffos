import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import HandoffOS from "./components/HandoffOS";
import { ThemeProvider } from "./contexts/ThemeContext";

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <HandoffOS />
          <Toaster theme="dark" richColors position="top-right" />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
