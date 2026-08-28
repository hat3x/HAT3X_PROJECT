import { Component, ErrorInfo, ReactNode } from 'react';

const ACTIVE_ORDER_KEY = 'monty-active-order';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: string | null;
}

/**
 * Red de seguridad global. Sin esto, cualquier excepción durante el render
 * desmonta todo el árbol de React y deja la pantalla en blanco (el fondo beige
 * del body), sin forma de salir — porque el pedido persistido en localStorage
 * hace que el mismo render vuelva a crashear en cada arranque.
 *
 * El fallback ofrece una salida real (limpiar el pedido atascado y recargar)
 * y muestra el error para poder diagnosticar el fallo exacto.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.setState({ info: errorInfo.componentStack ?? null });
  }

  private handleReset = () => {
    try {
      localStorage.removeItem(ACTIVE_ORDER_KEY);
    } catch {
      /* ignore */
    }
    window.location.href = window.location.origin;
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, info } = this.state;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 gap-6 text-center bg-background">
        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-destructive/15 text-destructive text-3xl">
          ⚠️
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold mb-2">Algo ha fallado</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            Si acabas de pagar, tu pedido está confirmado y ya está en preparación.
            Pulsa el botón para volver a empezar.
          </p>
        </div>
        <button
          onClick={this.handleReset}
          className="w-full max-w-xs px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold"
        >
          Empezar de nuevo
        </button>

        {/* Detalle técnico del error — visible para poder diagnosticar */}
        <details className="w-full max-w-md mt-2 text-left">
          <summary className="text-xs text-muted-foreground cursor-pointer">
            Ver detalles técnicos
          </summary>
          <pre className="mt-2 text-[10px] leading-snug whitespace-pre-wrap break-words bg-surface border border-border-subtle rounded-xl p-3 max-h-64 overflow-auto">
            {error?.name}: {error?.message}
            {'\n\n'}
            {error?.stack}
            {info ? `\n\nComponentes:${info}` : ''}
          </pre>
        </details>
      </div>
    );
  }
}
