export type QueryToken = 
  | { type: 'field', key: string, value: string, negated: boolean }
  | { type: 'range', key: string, start: string, end: string, negated: boolean }
  | { type: 'text', value: string, negated: boolean }
  | { type: 'regex', pattern: string, flags: string, negated: boolean }
  | { type: 'level', levels: string[], negated: boolean };

export interface ParsedQuery {
  tokens: QueryToken[];
  raw: string;
}

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal', 'trace'];
const LEVEL_ORDER: Record<string, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5
};

function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let inRegex = false;
  let escaped = false;

  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (char === '/' && !inQuotes) {
      current += char;
      if (!inRegex) {
        // Start of regex
        inRegex = true;
      } else {
        // End of regex - continue collecting optional flags
        inRegex = false;
        // Peek ahead for flags (letters after closing /)
        let j = i + 1;
        while (j < query.length && /[igmsuy]/.test(query[j])) {
          current += query[j];
          j++;
        }
        i = j - 1; // Update position to after flags
        
        // Check if next char is space/end - if so, complete the token
        if (j >= query.length || query[j] === ' ' || query[j] === '\t') {
          tokens.push(current.trim());
          current = '';
        }
      }
      continue;
    }

    if ((char === ' ' || char === '\t') && !inQuotes && !inRegex) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

function parseToken(token: string): QueryToken | null {
  const negated = token.startsWith('-');
  const cleanToken = negated ? token.substring(1) : token;

  // Regex pattern: /pattern/ or /pattern/flags
  if (cleanToken.startsWith('/') && cleanToken.includes('/')) {
    const lastSlash = cleanToken.lastIndexOf('/');
    if (lastSlash > 0) {
      const pattern = cleanToken.substring(1, lastSlash);
      const flags = cleanToken.substring(lastSlash + 1);
      return { type: 'regex', pattern, flags, negated };
    }
  }

  // Range query: level:warn..error or field:10..100
  const rangeMatch = cleanToken.match(/^(\w+):(.+?)\.\.(.+)$/);
  if (rangeMatch) {
    const [, key, start, end] = rangeMatch;
    
    // Special handling for level ranges
    if (key === 'level') {
      const startLevel = start.toLowerCase();
      const endLevel = end.toLowerCase();
      
      if (LOG_LEVELS.includes(startLevel) && LOG_LEVELS.includes(endLevel)) {
        const startOrder = LEVEL_ORDER[startLevel];
        const endOrder = LEVEL_ORDER[endLevel];
        
        const levels = LOG_LEVELS.filter(level => {
          const order = LEVEL_ORDER[level];
          return order >= startOrder && order <= endOrder;
        });
        
        return { type: 'level', levels, negated };
      }
    }
    
    return { type: 'range', key, start, end, negated };
  }

  // Field query: key:value
  const fieldMatch = cleanToken.match(/^(\w+):(.+)$/);
  if (fieldMatch) {
    const [, key, rawValue] = fieldMatch;
    
    // Remove quotes if present
    const value = rawValue.startsWith('"') && rawValue.endsWith('"') 
      ? rawValue.substring(1, rawValue.length - 1)
      : rawValue;
    
    // Special handling for level queries
    if (key === 'level') {
      const levelValue = value.toLowerCase();
      if (LOG_LEVELS.includes(levelValue)) {
        return { type: 'level', levels: [levelValue], negated };
      }
    }
    
    return { type: 'field', key, value, negated };
  }

  // Quoted text: "exact phrase"
  if (cleanToken.startsWith('"') && cleanToken.endsWith('"') && cleanToken.length > 2) {
    const value = cleanToken.substring(1, cleanToken.length - 1);
    return { type: 'text', value, negated };
  }

  // Plain text
  return { type: 'text', value: cleanToken, negated };
}

export function parseQuery(query: string): ParsedQuery {
  const trimmed = query.trim();
  if (!trimmed) {
    return { tokens: [], raw: query };
  }

  const tokenStrings = tokenizeQuery(trimmed);
  const tokens: QueryToken[] = [];

  for (const tokenStr of tokenStrings) {
    const token = parseToken(tokenStr);
    if (token) {
      tokens.push(token);
    }
  }

  return { tokens, raw: query };
}

export function matchesQuery(
  logRaw: string,
  logLevel: string | undefined,
  logFields: Array<{ key: string; value: string }>,
  parsedQuery: ParsedQuery
): boolean {
  if (parsedQuery.tokens.length === 0) {
    return true; // Empty query matches all
  }

  // All tokens must match (AND logic)
  for (const token of parsedQuery.tokens) {
    let matches = false;

    switch (token.type) {
      case 'level':
        if (logLevel) {
          matches = token.levels.includes(logLevel.toLowerCase());
        }
        break;

      case 'field': {
        const field = logFields.find(f => f.key === token.key);
        if (field) {
          matches = field.value.toLowerCase().includes(token.value.toLowerCase());
        }
        break;
      }

      case 'range': {
        const field = logFields.find(f => f.key === token.key);
        if (field) {
          // Try numeric comparison
          const value = parseFloat(field.value);
          const start = parseFloat(token.start);
          const end = parseFloat(token.end);
          
          if (!isNaN(value) && !isNaN(start) && !isNaN(end)) {
            matches = value >= start && value <= end;
          } else {
            // String comparison
            matches = field.value >= token.start && field.value <= token.end;
          }
        }
        break;
      }

      case 'regex':
        try {
          const regex = new RegExp(token.pattern, token.flags || 'i');
          matches = regex.test(logRaw);
        } catch {
          // Invalid regex, treat as text search
          matches = logRaw.toLowerCase().includes(token.pattern.toLowerCase());
        }
        break;

      case 'text':
        matches = logRaw.toLowerCase().includes(token.value.toLowerCase());
        break;
    }

    // Apply negation
    if (token.negated) {
      matches = !matches;
    }

    // If any token doesn't match, the entire query fails
    if (!matches) {
      return false;
    }
  }

  return true;
}
