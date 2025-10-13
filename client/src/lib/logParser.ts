export interface ParsedLogField {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean';
}

export interface ParsedLog {
  message: string;
  fields: ParsedLogField[];
  isJson: boolean;
}

const COMMON_FIELD_KEYS = [
  'traceId', 'trace_id', 'traceid',
  'requestId', 'request_id', 'reqId', 'req_id', 
  'spanId', 'span_id',
  'service', 'serviceName', 'service_name',
  'userId', 'user_id', 'uid',
  'correlationId', 'correlation_id',
  'sessionId', 'session_id',
  'host', 'hostname',
  'environment', 'env',
  'version',
  'method', 'path', 'status', 'statusCode', 'status_code',
  'duration', 'latency',
  'error', 'errorCode', 'error_code', 'errorMessage', 'error_message'
];

function findJsonBoundaries(str: string, start: number): { start: number; end: number } | null {
  if (str[start] !== '{') return null;
  
  let depth = 0;
  let inString = false;
  let escaped = false;
  
  for (let i = start; i < str.length; i++) {
    const char = str[i];
    
    if (escaped) {
      escaped = false;
      continue;
    }
    
    if (char === '\\') {
      escaped = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return { start, end: i + 1 };
      }
    }
  }
  
  return null;
}

export function parseLogLine(raw: string): ParsedLog {
  const trimmed = raw.trim();
  
  // Try to find JSON object with proper nesting
  const openBrace = trimmed.indexOf('{');
  if (openBrace === -1) {
    return { message: raw, fields: [], isJson: false };
  }
  
  const boundaries = findJsonBoundaries(trimmed, openBrace);
  if (!boundaries) {
    return { message: raw, fields: [], isJson: false };
  }
  
  try {
    const jsonStr = trimmed.substring(boundaries.start, boundaries.end);
    const parsed = JSON.parse(jsonStr);
    
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { message: raw, fields: [], isJson: false };
    }
    
    // Extract known fields for chips
    const fields: ParsedLogField[] = [];
    
    for (const key of COMMON_FIELD_KEYS) {
      if (key in parsed && parsed[key] != null) {
        const value = parsed[key];
        const type = typeof value === 'number' ? 'number' : 
                    typeof value === 'boolean' ? 'boolean' : 'string';
        
        fields.push({
          key,
          value: String(value),
          type
        });
      }
    }
    
    // Use message field if available, otherwise show the full raw log
    const messageField = parsed.message || parsed.msg || parsed.text;
    const message = messageField ? `${trimmed.substring(0, openBrace).trim()} ${messageField}` : raw;
    
    return {
      message,
      fields,
      isJson: true
    };
  } catch {
    return { message: raw, fields: [], isJson: false };
  }
}

export function buildFieldFilter(key: string, value: string): string {
  return `${key}:${value}`;
}
