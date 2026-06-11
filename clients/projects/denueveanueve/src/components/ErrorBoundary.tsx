import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
          <AlertTriangle size={48} className="text-destructive" />
          <h1 className="font-display text-2xl text-foreground">Algo salió mal</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            Ha ocurrido un error inesperado. Si el problema persiste, contacta con soporte.
          </p>
          <p className="text-xs text-muted-foreground/60 font-mono bg-secondary px-3 py-1.5 rounded max-w-xs break-all">
            {this.state.error?.message}
          </p>
          <Button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/home'; }}
            className="gradient-gold text-primary-foreground shadow-gold"
          >
            Volver al inicio
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
