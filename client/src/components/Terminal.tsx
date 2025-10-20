import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface TerminalProps {
  containerId: string;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  isConnected?: boolean;
}

export function Terminal({ containerId, onData, onResize, isConnected = false }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const handleData = useCallback((data: string) => {
    onData?.(data);
  }, [onData]);

  const handleResize = useCallback((cols: number, rows: number) => {
    onResize?.(cols, rows);
  }, [onResize]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
      theme: {
        background: 'transparent',
        foreground: '#f8f8f2',
        cursor: '#f8f8f0',
        black: '#000000',
        brightBlack: '#555555',
        red: '#ff5555',
        brightRed: '#ff6e67',
        green: '#50fa7b',
        brightGreen: '#5af78e',
        yellow: '#f1fa8c',
        brightYellow: '#f4f99d',
        blue: '#bd93f9',
        brightBlue: '#caa9fa',
        magenta: '#ff79c6',
        brightMagenta: '#ff92d0',
        cyan: '#8be9fd',
        brightCyan: '#9aedfe',
        white: '#bfbfbf',
        brightWhite: '#e6e6e6',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);

    fitAddon.fit();

    term.onData(handleData);

    term.onResize(({ cols, rows }) => {
      handleResize(cols, rows);
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    setIsInitialized(true);

    const handleWindowResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      term.dispose();
    };
  }, [containerId, handleData, handleResize]);

  useEffect(() => {
    if (xtermRef.current && isConnected && isInitialized) {
      xtermRef.current.clear();
      xtermRef.current.writeln('Connecting to container...');
    }
  }, [isConnected, isInitialized]);

  const writeToTerminal = (data: string) => {
    if (xtermRef.current) {
      xtermRef.current.write(data);
    }
  };

  useEffect(() => {
    (window as any).terminalWrite = writeToTerminal;
    return () => {
      delete (window as any).terminalWrite;
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--card))]" data-testid={`terminal-${containerId}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">Shell</span>
          {isConnected ? (
            <Badge variant="outline" className="text-xs bg-[hsl(142,76%,45%)]/10 text-[hsl(142,76%,45%)] border-[hsl(142,76%,45%)]/20">
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Connecting...
            </Badge>
          )}
        </div>
      </div>
      <div ref={terminalRef} className="flex-1 p-2" />
    </div>
  );
}
