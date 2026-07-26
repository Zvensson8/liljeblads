import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

interface Props {
  children: ReactNode;
  routeName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Per-route error boundary. Renders a friendly card instead of a blank
 * screen when a single page crashes, keeping the sidebar/nav mounted
 * around it. Use inside <Route element={...}> wrappers.
 */
class RouteErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[RouteErrorBoundary${this.props.routeName ? ` ${this.props.routeName}` : ''}]`,
      error,
      errorInfo,
    );
  }

  private reset = () => this.setState({ hasError: false, error: null });
  private goBack = () => window.history.back();

  public render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Något gick fel</CardTitle>
            <CardDescription>
              Sidan kunde inte visas. Försök igen eller gå tillbaka.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {import.meta.env.DEV && this.state.error && (
              <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs text-destructive">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2" onClick={this.goBack}>
                <ArrowLeft className="h-4 w-4" />
                Tillbaka
              </Button>
              <Button className="flex-1 gap-2" onClick={this.reset}>
                <RefreshCw className="h-4 w-4" />
                Försök igen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

export default RouteErrorBoundary;
