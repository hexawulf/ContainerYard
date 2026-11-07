import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ContainerAction } from '@shared/schema';

interface ActionConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  action: ContainerAction;
  containerName: string;
  isLoading?: boolean;
  /** "container" (default) or "stack": changes the wording only. */
  kind?: 'container' | 'stack';
}

export function ActionConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  action,
  containerName,
  isLoading,
  kind = 'container',
}: ActionConfirmDialogProps) {
  const noun = kind === 'stack' ? 'Stack' : 'Container';
  const actionDetails = {
    start: {
      title: `Start ${noun}`,
      description: `Are you sure you want to start "${containerName}"?`,
      confirmText: 'Start',
      variant: 'default' as const,
    },
    stop: {
      title: `Stop ${noun}`,
      description: `Are you sure you want to stop "${containerName}"? This will gracefully stop the container.`,
      confirmText: 'Stop',
      variant: 'default' as const,
    },
    restart: {
      title: `Restart ${noun}`,
      description: `Are you sure you want to restart "${containerName}"? The container will be stopped and started again.`,
      confirmText: 'Restart',
      variant: 'default' as const,
    },
    pause: {
      title: `Pause ${noun}`,
      description: `Are you sure you want to pause "${containerName}"? All processes are frozen until it is unpaused.`,
      confirmText: 'Pause',
      variant: 'default' as const,
    },
    unpause: {
      title: `Unpause ${noun}`,
      description: `Resume "${containerName}"?`,
      confirmText: 'Unpause',
      variant: 'default' as const,
    },
    remove: {
      title: `Remove ${noun}`,
      description: `Are you sure you want to remove "${containerName}"? This action cannot be undone. The container will be permanently deleted.`,
      confirmText: 'Remove',
      variant: 'destructive' as const,
    },
  };

  const details = actionDetails[action];

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent data-testid={`dialog-confirm-${action}`}>
        <AlertDialogHeader>
          <AlertDialogTitle>{details.title}</AlertDialogTitle>
          <AlertDialogDescription>{details.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading} data-testid="button-cancel-action">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            variant={details.variant}
            data-testid={`button-confirm-${action}`}
          >
            {isLoading ? 'Processing...' : details.confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
