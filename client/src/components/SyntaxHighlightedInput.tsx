import { Input } from '@/components/ui/input';
import { parseQuery } from '@/lib/queryParser';
import { useState, useRef, useEffect } from 'react';

interface SyntaxHighlightedInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'data-testid'?: string;
}

export function SyntaxHighlightedInput({
  value,
  onChange,
  placeholder,
  className,
  'data-testid': testId,
}: SyntaxHighlightedInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const renderHighlightedText = () => {
    if (!value || !isFocused) return null;

    const parsed = parseQuery(value);
    const parts: Array<{ text: string; color: string }> = [];
    let lastIndex = 0;

    // Simple tokenization for highlighting
    const tokens = value.split(/(\s+)/);
    
    for (const token of tokens) {
      if (token.trim() === '') {
        parts.push({ text: token, color: 'transparent' });
        continue;
      }

      const negated = token.startsWith('-');
      const cleanToken = negated ? token.substring(1) : token;

      let color = 'hsl(var(--foreground))';

      // Regex
      if (cleanToken.match(/^\/.*\/[igmsuy]*$/)) {
        color = 'hsl(var(--primary))';
      }
      // Field or range
      else if (cleanToken.match(/^\w+:.+/)) {
        color = 'hsl(var(--chart-1))';
      }
      // Quoted text
      else if (cleanToken.match(/^".*"$/)) {
        color = 'hsl(var(--chart-2))';
      }
      // Negation prefix
      if (negated) {
        color = 'hsl(var(--destructive))';
      }

      parts.push({ text: token, color });
    }

    return (
      <div
        className="absolute inset-0 pointer-events-none flex items-center px-3 font-mono text-sm whitespace-pre overflow-hidden"
        style={{ color: 'transparent' }}
      >
        {parts.map((part, index) => (
          <span key={index} style={{ color: part.color }}>
            {part.text}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className={className}
        data-testid={testId}
        style={isFocused && value ? { color: 'transparent', caretColor: 'hsl(var(--foreground))' } : undefined}
      />
      {renderHighlightedText()}
    </div>
  );
}
