import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

export function QuerySyntaxReference() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          data-testid="button-query-help"
          title="Query syntax help"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Advanced Query Syntax</DialogTitle>
          <DialogDescription>
            Filter logs using powerful query expressions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold mb-2">Basic Searches</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">error</Badge>
                <span className="text-muted-foreground">Search for text "error" anywhere in logs</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">"exact phrase"</Badge>
                <span className="text-muted-foreground">Search for exact phrase</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Field Queries</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">service:nginx</Badge>
                <span className="text-muted-foreground">Filter by field value</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">userId:user-123</Badge>
                <span className="text-muted-foreground">Match specific user ID</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">status:500</Badge>
                <span className="text-muted-foreground">Filter by HTTP status</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Level Filters</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">level:error</Badge>
                <span className="text-muted-foreground">Show only error logs</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">level:warn..error</Badge>
                <span className="text-muted-foreground">Show warnings and errors (range)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">level:debug..info</Badge>
                <span className="text-muted-foreground">Show debug and info logs</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Range Queries</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">duration:100..500</Badge>
                <span className="text-muted-foreground">Filter by numeric range</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">status:400..499</Badge>
                <span className="text-muted-foreground">4xx status codes</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Negation</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="font-mono">-debug</Badge>
                <span className="text-muted-foreground">Exclude logs containing "debug"</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="font-mono">-service:health</Badge>
                <span className="text-muted-foreground">Exclude health check logs</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="font-mono">-level:debug</Badge>
                <span className="text-muted-foreground">Exclude debug level logs</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Regex Patterns</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono">/user-\d+/</Badge>
                <span className="text-muted-foreground">Match user IDs with numbers</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono">/err(or)?/i</Badge>
                <span className="text-muted-foreground">Match "err" or "error" (case-insensitive)</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Combining Filters</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">level:error service:auth</Badge>
                <span className="text-muted-foreground">All conditions must match (AND)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">status:500 -service:health</Badge>
                <span className="text-muted-foreground">500 errors excluding health checks</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="font-mono">level:warn..error duration:1000..</Badge>
                <span className="text-muted-foreground">Slow warnings/errors (duration ≥ 1000)</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Common Fields</h3>
            <div className="flex flex-wrap gap-1">
              {['traceId', 'requestId', 'service', 'userId', 'method', 'path', 'status', 'duration', 'errorCode'].map(field => (
                <Badge key={field} variant="outline" className="text-xs">{field}</Badge>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
