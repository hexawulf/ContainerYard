import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Copy, Check } from 'lucide-react';
import type { EnvVar } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

interface EnvVarsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  envVars: EnvVar[];
  containerName: string;
}

export function EnvVarsPanel({ isOpen, onClose, envVars, containerName }: EnvVarsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { toast } = useToast();

  const filteredVars = envVars.filter(
    (envVar) =>
      envVar.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      envVar.value.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    toast({
      title: 'Copied to clipboard',
      description: `${key} value copied`,
      duration: 2000,
    });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]" data-testid="dialog-env-vars">
        <DialogHeader>
          <DialogTitle>Environment Variables - {containerName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search environment variables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-env-search"
            />
          </div>

          <div className="border rounded-md max-h-96 overflow-auto">
            {filteredVars.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {searchQuery ? 'No environment variables match your search' : 'No environment variables'}
              </div>
            ) : (
              <div className="divide-y">
                {filteredVars.map((envVar, idx) => (
                  <div
                    key={idx}
                    className="p-3 flex items-start gap-3 hover:bg-accent/50 transition-colors"
                    data-testid={`env-var-${idx}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm font-semibold mb-1 break-all">
                        {envVar.key}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground break-all">
                        {envVar.value}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8"
                      onClick={() => handleCopy(envVar.key, envVar.value)}
                      data-testid={`button-copy-env-${idx}`}
                    >
                      {copiedKey === envVar.key ? (
                        <Check className="h-4 w-4 text-[hsl(142,76%,45%)]" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground text-right">
            {filteredVars.length} of {envVars.length} variables
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
