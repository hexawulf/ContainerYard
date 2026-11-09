import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export const HEADER_ICON_BUTTON_CLASS =
  "h-9 w-9 shrink-0 rounded-md border border-border/60 bg-background/60 text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={label}
          title={label}
          data-testid="button-theme-toggle"
          className={cn(HEADER_ICON_BUTTON_CLASS, className)}
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4 text-foreground transition-transform duration-150" />
          ) : (
            <Moon className="h-4 w-4 text-foreground transition-transform duration-150" />
          )}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
