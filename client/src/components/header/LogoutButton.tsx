import { useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthGate";
import { HEADER_ICON_BUTTON_CLASS } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function LogoutButton() {
  const { logout } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const handleLogout = async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      await logout();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Log out"
          title="Log out"
          data-testid="button-logout"
          disabled={isPending}
          onClick={() => void handleLogout()}
          className={HEADER_ICON_BUTTON_CLASS}
        >
          <LogOut className="h-4 w-4 text-foreground" />
          <span className="sr-only">Log out</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Log out</TooltipContent>
    </Tooltip>
  );
}
