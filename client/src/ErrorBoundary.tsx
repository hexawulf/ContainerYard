import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryState {
  err?: string;
  componentStack?: string | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

/**
 * Error boundary to prevent blank screen on React crashes.
 * Shows detailed diagnostic info including component stack trace.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { err: undefined, componentStack: undefined };

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
    
    // Extract the specific value that's undefined from the error message
    let undefinedValue = 'unknown';
    if (error.message.includes("reading 'map'")) {
      const match = error.message.match(/Cannot read properties of (\w+) \(reading 'map'\)/);
      if (match) {
        undefinedValue = match[1];
      }
    }
    
    this.setState({ 
      err: error.message,
      componentStack: info.componentStack 
    });
    
    // Log additional context for debugging
    console.error('[ErrorBoundary] Undefined value:', undefinedValue);
    console.error('[ErrorBoundary] Window CY variables:', {
      __CY_API_BASE__: (window as any).__CY_API_BASE__,
      __CY_HOSTS__: (window as any).__CY_HOSTS__,
      __CY_APP_NAME__: (window as any).__CY_APP_NAME__,
      __CY_FEATURES__: (window as any).__CY_FEATURES__
    });
  }

  render() {
    if (this.state.err) {
      const api = (window as any).__CY_API_BASE__ || (import.meta as any).env?.VITE_API_BASE;
      const hosts = (window as any).__CY_HOSTS__;
      
      return (
        <pre style={{ padding: 24, color: '#ff8', background: '#222', margin: 0, minHeight: '100vh', whiteSpace: 'pre-wrap' }}>
          {`UI crashed: ${this.state.err}

API_BASE=${api || 'undefined'}
Hosts data: ${hosts ? `Array(${hosts.length})` : 'undefined'}

Component stack:
${this.state.componentStack || 'Not available'}

Check browser console for detailed logs.`}
        </pre>
      );
    }
    return this.props.children;
  }
}
