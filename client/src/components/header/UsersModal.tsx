import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/AuthGate";
import { HEADER_ICON_BUTTON_CLASS } from "@/components/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  extractApiErrorMessage,
  generateRandomPassword,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_CHARS,
  validateClientPassword,
} from "./headerUtils";

export interface ManagedUser {
  id: string;
  email: string;
  role: "ADMIN" | "VIEWER";
  createdAt: string;
  updatedAt: string;
}

const EYE_TOGGLE_CLASS =
  "absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

export function UsersModal() {
  const { user: currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Add-user form state
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "VIEWER">("VIEWER");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Reset-password sub-dialog state
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Delete confirmation AlertDialog state
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);

  const usersQuery = useQuery<ManagedUser[]>({
    queryKey: ["/api/users"],
    enabled: open && currentUser?.role === "ADMIN",
    staleTime: 0,
  });

  const users = usersQuery.data ?? [];
  const adminCount = users.filter((u) => u.role === "ADMIN").length;

  const createUserMutation = useMutation({
    mutationFn: async (payload: {
      email: string;
      role: "ADMIN" | "VIEWER";
      password: string;
    }) => {
      const res = await apiRequest("POST", "/users", payload);
      return (await res.json()) as ManagedUser;
    },
    onSuccess: (created) => {
      setInlineError(null);
      setNewEmail("");
      setNewRole("VIEWER");
      setNewPassword("");
      setShowNewPassword(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User created",
        description: `${created.email} (${created.role}) has been added.`,
      });
    },
    onError: (err) => {
      setInlineError(extractApiErrorMessage(err, "Failed to create user."));
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: "ADMIN" | "VIEWER";
    }) => {
      const res = await apiRequest("PATCH", `/users/${userId}`, { role });
      return (await res.json()) as ManagedUser;
    },
    onSuccess: (updated) => {
      setInlineError(null);
      void queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Role updated",
        description: `${updated.email} is now ${updated.role}.`,
      });
    },
    onError: (err) => {
      setInlineError(extractApiErrorMessage(err, "Failed to update role."));
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({
      userId,
      newPassword: pwd,
    }: {
      userId: string;
      newPassword: string;
    }) => {
      const res = await apiRequest("POST", `/users/${userId}/reset-password`, {
        newPassword: pwd,
      });
      return res.json();
    },
    onSuccess: () => {
      const email = resetTarget?.email ?? "user";
      setResetTarget(null);
      setResetPasswordValue("");
      setShowResetPassword(false);
      setResetError(null);
      toast({
        title: "Password reset",
        description: `Password updated for ${email}. Their active sessions were revoked.`,
      });
    },
    onError: (err) => {
      setResetError(extractApiErrorMessage(err, "Failed to reset password."));
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/users/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      const email = deleteTarget?.email ?? "User";
      setDeleteTarget(null);
      setInlineError(null);
      void queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User deleted",
        description: `${email} has been removed.`,
      });
    },
    onError: (err) => {
      setDeleteTarget(null);
      setInlineError(extractApiErrorMessage(err, "Failed to delete user."));
    },
  });

  const handleCreateUser = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setInlineError(null);

    const trimmedEmail = newEmail.trim();
    if (!trimmedEmail) {
      setInlineError("Email is required.");
      return;
    }
    const pwdError = validateClientPassword(newPassword);
    if (pwdError) {
      setInlineError(pwdError);
      return;
    }

    createUserMutation.mutate({
      email: trimmedEmail,
      role: newRole,
      password: newPassword,
    });
  };

  const handleResetPasswordSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);

    const pwdError = validateClientPassword(resetPasswordValue);
    if (pwdError) {
      setResetError(pwdError);
      return;
    }

    resetPasswordMutation.mutate({
      userId: resetTarget.id,
      newPassword: resetPasswordValue,
    });
  };

  const copyPassword = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied to clipboard` });
    } catch {
      toast({
        title: "Couldn't copy password",
        description: "Reveal the field and copy it manually.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setInlineError(null);
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Manage users"
                title="Manage users"
                data-testid="button-users"
                className={HEADER_ICON_BUTTON_CLASS}
              >
                <Users className="h-4 w-4 text-foreground" />
                <span className="sr-only">Manage users</span>
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Manage users</TooltipContent>
        </Tooltip>

        <DialogContent
          data-testid="users-dialog"
          className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"
        >
          <DialogHeader className="text-left">
            <DialogTitle>User Administration</DialogTitle>
            <DialogDescription>
              Create accounts, change roles, reset passwords, or remove users. Role changes
              and password resets immediately revoke the user&apos;s active sessions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {inlineError && (
              <Alert variant="destructive" data-testid="users-modal-error">
                <AlertDescription>{inlineError}</AlertDescription>
              </Alert>
            )}

            {/* Existing Users Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Accounts ({users.length})
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void usersQuery.refetch()}
                  disabled={usersQuery.isFetching}
                >
                  <RefreshCw
                    className={`mr-1.5 h-3.5 w-3.5 ${usersQuery.isFetching ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
              </div>

              {usersQuery.isLoading ? (
                <div
                  data-testid="users-loading"
                  className="rounded-md border border-border/80 bg-muted/20 p-6 text-center text-sm text-muted-foreground"
                >
                  Loading users…
                </div>
              ) : usersQuery.isError ? (
                <Alert variant="destructive" data-testid="users-query-error">
                  <AlertDescription>
                    {extractApiErrorMessage(usersQuery.error, "Failed to load users.")}
                  </AlertDescription>
                </Alert>
              ) : users.length === 0 ? (
                <div
                  data-testid="users-empty"
                  className="rounded-md border border-border/80 bg-muted/20 p-6 text-center text-sm text-muted-foreground"
                >
                  No users found.
                </div>
              ) : (
                <div className="rounded-md border border-border/80">
                  <Table data-testid="users-table">
                    <TableHeader className="hidden sm:table-header-group">
                      <TableRow>
                        <TableHead className="h-9 px-3 text-xs">Email</TableHead>
                        <TableHead className="h-9 px-3 text-xs">Role</TableHead>
                        <TableHead className="h-9 px-3 text-xs">Created</TableHead>
                        <TableHead className="h-9 px-3 text-right text-xs">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => {
                        const isSelf = u.id === currentUser?.id;
                        const isLastAdmin = u.role === "ADMIN" && adminCount <= 1;
                        const disableDemoteOrDelete = isSelf || isLastAdmin;
                        const protectionReason = isSelf
                          ? "You cannot modify or delete your own admin status here"
                          : isLastAdmin
                            ? "Cannot demote or delete the last remaining ADMIN"
                            : undefined;

                        return (
                          <TableRow
                            key={u.id}
                            data-testid={`user-row-${u.email}`}
                            className="flex flex-col gap-2 p-3 sm:table-row sm:p-0"
                          >
                            <TableCell className="p-0 font-medium sm:px-3 sm:py-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="break-all text-xs sm:text-sm">
                                  {u.email}
                                </span>
                                {isSelf && (
                                  <Badge
                                    variant="secondary"
                                    className="px-1.5 py-0 font-mono text-[10px]"
                                    data-testid="badge-current-user"
                                  >
                                    (you)
                                  </Badge>
                                )}
                                <Badge
                                  variant="outline"
                                  className="px-1.5 py-0 font-mono text-[10px] uppercase"
                                >
                                  {u.role}
                                </Badge>
                              </div>
                            </TableCell>

                            <TableCell className="p-0 sm:px-3 sm:py-2.5">
                              <Select
                                value={u.role}
                                disabled={
                                  disableDemoteOrDelete ||
                                  changeRoleMutation.isPending
                                }
                                onValueChange={(val) =>
                                  changeRoleMutation.mutate({
                                    userId: u.id,
                                    role: val as "ADMIN" | "VIEWER",
                                  })
                                }
                              >
                                <SelectTrigger
                                  data-testid={`select-role-${u.email}`}
                                  aria-label={`Role for ${u.email}`}
                                  title={protectionReason}
                                  className="h-8 w-full text-xs font-mono sm:w-28"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                                  <SelectItem value="VIEWER">VIEWER</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>

                            <TableCell className="whitespace-nowrap p-0 font-mono text-xs text-muted-foreground sm:px-3 sm:py-2.5">
                              <span className="sm:hidden">Created </span>
                              {formatDate(u.createdAt)}
                            </TableCell>

                            <TableCell className="p-0 sm:px-3 sm:py-2.5 sm:text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2.5 text-xs"
                                  data-testid={`button-reset-password-${u.email}`}
                                  aria-label={`Reset password for ${u.email}`}
                                  onClick={() => {
                                    setResetTarget(u);
                                    setResetPasswordValue("");
                                    setShowResetPassword(false);
                                    setResetError(null);
                                  }}
                                >
                                  <KeyRound className="mr-1 h-3.5 w-3.5" />
                                  Reset
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  data-testid={`button-delete-user-${u.email}`}
                                  aria-label={`Delete ${u.email}`}
                                  title={protectionReason}
                                  disabled={
                                    disableDemoteOrDelete ||
                                    deleteUserMutation.isPending
                                  }
                                  onClick={() => setDeleteTarget(u)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Add User Form */}
            <form
              onSubmit={handleCreateUser}
              data-testid="form-create-user"
              className="space-y-3 rounded-md border border-border/80 bg-muted/20 p-4"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
                <UserPlus className="h-3.5 w-3.5 text-primary" />
                Add User
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="space-y-1 sm:col-span-5">
                  <Label htmlFor="new-user-email" className="text-xs">
                    Email
                  </Label>
                  <Input
                    id="new-user-email"
                    data-testid="input-new-user-email"
                    type="email"
                    placeholder="user@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={createUserMutation.isPending}
                    required
                  />
                </div>

                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor="new-user-role" className="text-xs">
                    Role
                  </Label>
                  <Select
                    value={newRole}
                    onValueChange={(v) => setNewRole(v as "ADMIN" | "VIEWER")}
                    disabled={createUserMutation.isPending}
                  >
                    <SelectTrigger
                      id="new-user-role"
                      data-testid="select-new-user-role"
                      className="font-mono text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEWER">VIEWER</SelectItem>
                      <SelectItem value="ADMIN">ADMIN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 sm:col-span-4">
                  <Label htmlFor="new-user-password" className="text-xs">
                    Initial Password ({PASSWORD_MIN_CHARS}–{PASSWORD_MAX_BYTES} B)
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-user-password"
                      data-testid="input-new-user-password"
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="At least 12 chars"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={createUserMutation.isPending}
                      required
                      className="pr-9"
                    />
                    <button
                      type="button"
                      className={EYE_TOGGLE_CLASS}
                      aria-label={
                        showNewPassword
                          ? "Hide initial password"
                          : "Show initial password"
                      }
                      onClick={() => setShowNewPassword((v) => !v)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    data-testid="button-generate-new-password"
                    onClick={() => {
                      const generated = generateRandomPassword(16);
                      setNewPassword(generated);
                      setShowNewPassword(true);
                    }}
                  >
                    Generate password
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    data-testid="button-copy-new-password"
                    disabled={!newPassword}
                    onClick={() => void copyPassword(newPassword, "Initial password")}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>

                <Button
                  type="submit"
                  size="sm"
                  data-testid="button-create-user"
                  disabled={createUserMutation.isPending}
                >
                  {createUserMutation.isPending ? "Adding…" : "Add User"}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={Boolean(resetTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setResetTarget(null);
            setResetPasswordValue("");
            setShowResetPassword(false);
            setResetError(null);
          }
        }}
      >
        <DialogContent
          data-testid="reset-password-dialog"
          className="sm:max-w-md"
        >
          <DialogHeader className="text-left">
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for{" "}
              <span className="font-medium text-foreground">
                {resetTarget?.email}
              </span>
              . All of their active sessions will be signed out.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
            {resetError && (
              <Alert variant="destructive" data-testid="reset-password-error">
                <AlertDescription>{resetError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reset-user-password">
                New password ({PASSWORD_MIN_CHARS}–{PASSWORD_MAX_BYTES} bytes)
              </Label>
              <div className="relative">
                <Input
                  id="reset-user-password"
                  data-testid="input-reset-password"
                  type={showResetPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  disabled={resetPasswordMutation.isPending}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  className={EYE_TOGGLE_CLASS}
                  aria-label={
                    showResetPassword
                      ? "Hide reset password"
                      : "Show reset password"
                  }
                  onClick={() => setShowResetPassword((v) => !v)}
                >
                  {showResetPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                data-testid="button-generate-reset-password"
                onClick={() => {
                  const generated = generateRandomPassword(16);
                  setResetPasswordValue(generated);
                  setShowResetPassword(true);
                }}
              >
                Generate
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                data-testid="button-copy-reset-password"
                disabled={!resetPasswordValue}
                onClick={() => void copyPassword(resetPasswordValue, "Reset password")}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy
              </Button>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetTarget(null)}
                disabled={resetPasswordMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="button-submit-reset-password"
                disabled={resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending ? "Saving…" : "Save Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation AlertDialog */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent data-testid="delete-user-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user account?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm deleting{" "}
              <span className="font-mono font-semibold text-foreground">
                {deleteTarget?.email}
              </span>
              . Their saved searches, log bookmarks, and active sessions will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="button-confirm-delete-user"
              disabled={deleteUserMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteUserMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteUserMutation.isPending ? "Deleting…" : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
