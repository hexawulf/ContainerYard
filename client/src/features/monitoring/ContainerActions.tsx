import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pause, Play, RotateCw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionConfirmDialog } from "@/components/ActionConfirmDialog";
import { useAuth } from "@/components/AuthGate";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { ContainerAction } from "@shared/schema";
import type { ContainerSummary, HostSummary } from "@shared/monitoring";

// Actions that interrupt a workload ask for confirmation first.
const NEEDS_CONFIRM: ReadonlySet<ContainerAction> = new Set<ContainerAction>(["stop", "restart", "pause", "remove"]);

const PAST_TENSE: Record<ContainerAction, string> = {
  start: "started",
  stop: "stopped",
  restart: "restarted",
  pause: "paused",
  unpause: "unpaused",
  remove: "removed",
};

function actionsForState(state: string): ContainerAction[] {
  switch (state) {
    case "running":
      return ["pause", "restart", "stop"];
    case "paused":
      return ["unpause"];
    case "restarting":
      return ["stop"];
    default: // created, exited, dead
      return ["start"];
  }
}

const ICONS: Record<ContainerAction, typeof Play> = {
  start: Play,
  stop: Square,
  restart: RotateCw,
  pause: Pause,
  unpause: Play,
  remove: Trash2,
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    try {
      const parsed = JSON.parse(error.body);
      if (parsed?.error) return String(parsed.error);
    } catch {
      // fall through
    }
  }
  return error instanceof Error ? error.message : String(error);
}

interface ContainerActionsProps {
  container: Pick<ContainerSummary, "id" | "name" | "state">;
  host: HostSummary | null;
}

/** Inline lifecycle buttons for one container (ADMIN + Docker hosts only). */
export function ContainerActions({ container, host }: ContainerActionsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pending, setPending] = useState<ContainerAction | null>(null);

  const mutation = useMutation({
    mutationFn: async (action: ContainerAction) => {
      const res = await apiRequest("POST", `/api/hosts/${host!.id}/containers/${container.id}/actions`, { action });
      return (await res.json()) as { state?: string; noop?: boolean };
    },
    onSuccess: (data, action) => {
      toast({
        title: `${container.name} ${PAST_TENSE[action]}`,
        description: data.noop ? `Already ${data.state}; nothing to do.` : data.state ? `State: ${data.state}` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hosts", host!.id, "containers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hosts", host!.id, "stacks"] });
    },
    onError: (error, action) => {
      toast({
        title: `Could not ${action} ${container.name}`,
        description: errorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: () => setPending(null),
  });

  if (!host || host.provider !== "DOCKER" || user?.role !== "ADMIN") {
    return null;
  }

  const run = (action: ContainerAction) => {
    if (NEEDS_CONFIRM.has(action)) {
      setPending(action);
    } else {
      mutation.mutate(action);
    }
  };

  const actions: ContainerAction[] = [...actionsForState(container.state), "remove"];

  return (
    <>
      {actions.map((action) => {
        const Icon = ICONS[action];
        return (
          <Button
            key={action}
            size="sm"
            variant="ghost"
            title={action[0].toUpperCase() + action.slice(1)}
            aria-label={`${action} ${container.name}`}
            data-testid={`button-${action}-${container.name}`}
            disabled={mutation.isPending}
            className={action === "remove" ? "text-destructive hover:text-destructive" : undefined}
            onClick={(event) => {
              event.stopPropagation();
              run(action);
            }}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}
      {pending && (
        <ActionConfirmDialog
          isOpen
          onClose={() => {
            if (!mutation.isPending) setPending(null);
          }}
          onConfirm={() => mutation.mutate(pending)}
          action={pending}
          containerName={container.name}
          isLoading={mutation.isPending}
        />
      )}
    </>
  );
}
