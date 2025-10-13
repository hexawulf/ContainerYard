import { Badge } from '@/components/ui/badge';
import { parseQuery, type QueryToken } from '@/lib/queryParser';
import { Info } from 'lucide-react';

interface QuerySyntaxHelperProps {
  query: string;
}

function getTokenBadgeVariant(token: QueryToken): "default" | "secondary" | "destructive" | "outline" {
  if (token.negated) return "destructive";
  
  switch (token.type) {
    case 'field':
    case 'range':
      return "default";
    case 'level':
      return "secondary";
    case 'regex':
      return "outline";
    default:
      return "secondary";
  }
}

function getTokenLabel(token: QueryToken): string {
  switch (token.type) {
    case 'field':
      return `${token.negated ? '-' : ''}${token.key}:${token.value}`;
    case 'range':
      return `${token.negated ? '-' : ''}${token.key}:${token.start}..${token.end}`;
    case 'level':
      return `${token.negated ? '-' : ''}level:${token.levels.join(',')}`;
    case 'regex':
      return `${token.negated ? '-' : ''}/${token.pattern}/${token.flags}`;
    case 'text':
      return `${token.negated ? '-' : ''}"${token.value}"`;
  }
}

function getTokenDescription(token: QueryToken): string {
  switch (token.type) {
    case 'field':
      return `Field filter: ${token.key} contains "${token.value}"`;
    case 'range':
      return `Range filter: ${token.key} between ${token.start} and ${token.end}`;
    case 'level':
      return `Level filter: ${token.levels.join(', ')}`;
    case 'regex':
      return `Regex pattern: ${token.pattern}`;
    case 'text':
      return `Text search: "${token.value}"`;
  }
}

export function QuerySyntaxHelper({ query }: QuerySyntaxHelperProps) {
  if (!query.trim()) return null;

  const parsed = parseQuery(query);
  
  if (parsed.tokens.length === 0) return null;

  return (
    <div className="px-3 py-2 bg-muted/30 border-b">
      <div className="flex items-start gap-2">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">Query breakdown:</div>
          <div className="flex flex-wrap gap-1">
            {parsed.tokens.map((token, index) => (
              <Badge
                key={index}
                variant={getTokenBadgeVariant(token)}
                className="text-xs h-6"
                title={getTokenDescription(token)}
                data-testid={`query-token-${index}`}
              >
                {getTokenLabel(token)}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
