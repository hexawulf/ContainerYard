import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryState {
  err?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

/**
 * Error boundary to prevent blank screen on React crashes.
 * Shows diagnostic info including API_BASE resolution.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { err: undefined };

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    this.setState({ err: error.message });
  }

  render() {
    if (this.state.err) {
      const api = (window as any).__CY_API_BASE__ || (import.meta as any).env?.VITE_API_BASE;
      return (
        <pre style={{ padding: 24, color: '#ff8', background: '#222', margin: 0, minHeight: '100vh' }}>
          {`UI crashed: ${this.state.err}\n\nAPI_BASE=${api || 'undefined'}\n\nCheck console for details.`}
        </pre>
      );
    }
    return this.props.children;
  }
}
