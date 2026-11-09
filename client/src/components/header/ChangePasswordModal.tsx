import { FormEvent, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { HEADER_ICON_BUTTON_CLASS } from "@/components/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { apiRequest, clearCsrfToken } from "@/lib/queryClient";
import {
  extractApiErrorMessage,
  getUtf8ByteLength,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_CHARS,
  validateClientPassword,
} from "./headerUtils";

const EYE_TOGGLE_CLASS =
  "absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ChangePasswordModal() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setError(null);
    setIsPending(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  const newPasswordBytes = getUtf8ByteLength(newPassword);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError("Current password is required.");
      return;
    }

    const clientError = validateClientPassword(newPassword, {
      currentPassword,
      confirmPassword,
    });
    if (clientError) {
      setError(clientError);
      return;
    }

    setIsPending(true);
    try {
      await apiRequest("POST", "/auth/change-password", {
        currentPassword,
        newPassword,
      });
      clearCsrfToken();
      toast({
        title: "Password updated",
        description: "Your password has been changed and other sessions were signed out.",
      });
      resetForm();
      setOpen(false);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to change password."));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Change password"
              title="Change password"
              data-testid="button-change-password"
              className={HEADER_ICON_BUTTON_CLASS}
            >
              <KeyRound className="h-4 w-4 text-foreground" />
              <span className="sr-only">Change password</span>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Change password</TooltipContent>
      </Tooltip>

      <DialogContent
        data-testid="change-password-dialog"
        className="max-h-[85vh] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader className="text-left">
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            Choose a new password ({PASSWORD_MIN_CHARS}–{PASSWORD_MAX_BYTES} bytes). Any other
            active sessions for your account will be signed out.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive" data-testid="change-password-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <div className="relative">
              <Input
                id="current-password"
                data-testid="input-current-password"
                type={showCurrent ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isPending}
                required
                className="pr-10"
              />
              <button
                type="button"
                className={EYE_TOGGLE_CLASS}
                aria-label={showCurrent ? "Hide current password" : "Show current password"}
                onClick={() => setShowCurrent((v) => !v)}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="new-password">New password</Label>
              <span className="font-mono text-[11px] text-muted-foreground">
                {newPassword.length} chars · {newPasswordBytes}/{PASSWORD_MAX_BYTES} B
              </span>
            </div>
            <div className="relative">
              <Input
                id="new-password"
                data-testid="input-new-password"
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isPending}
                required
                className="pr-10"
              />
              <button
                type="button"
                className={EYE_TOGGLE_CLASS}
                aria-label={showNew ? "Hide new password" : "Show new password"}
                onClick={() => setShowNew((v) => !v)}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                data-testid="input-confirm-password"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isPending}
                required
                className="pr-10"
              />
              <button
                type="button"
                className={EYE_TOGGLE_CLASS}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                onClick={() => setShowConfirm((v) => !v)}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="button-submit-change-password"
              disabled={isPending}
            >
              {isPending ? "Updating…" : "Update Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
