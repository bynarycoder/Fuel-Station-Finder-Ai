"use client";

import React, { Component, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ErrorState } from "@/components/ui/states";
import i18n from "@/i18n/config";

interface ProvidersProps {
  children: React.ReactNode;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * App-wide error boundary.
 *
 * React error boundaries require the class lifecycle, so this is a class
 * component. If any client-side render throws, the user gets a designed,
 * recoverable error state instead of a blank white screen. The real error is
 * logged to the console for diagnostics, but never shown to the user.
 */
class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    console.error("Application error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  private handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
          <ErrorState
            title={i18n.t("errors.somethingWentWrong")}
            description={i18n.t("errors.unexpected")}
            onRetry={this.handleReset}
            retryLabel={i18n.t("errors.tryAgain")}
            secondaryAction={
              <Button variant="secondary" size="sm" onClick={this.handleReload}>
                {i18n.t("errors.reloadApp")}
              </Button>
            }
            className="max-w-md"
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default function Providers({ children }: ProvidersProps) {
  // Use state to guarantee QueryClient is only initialized once per session
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute stale time
            refetchOnWindowFocus: false, // Prevents unnecessary refetches on tab focus
            retry: 1, // Retry failed queries once before showing error
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LocaleProvider>
          <AppErrorBoundary>{children}</AppErrorBoundary>
        </LocaleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
