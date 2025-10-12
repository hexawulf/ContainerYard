import { useHotkeys } from 'react-hotkeys-hook';
import type { KeyboardShortcut } from '@shared/schema';

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  shortcuts.forEach(shortcut => {
    useHotkeys(
      shortcut.key,
      (e) => {
        e.preventDefault();
        shortcut.action();
      },
      {
        enableOnFormTags: false,
        enabled: true,
      }
    );
  });

  return shortcuts;
}

export const defaultShortcuts: Omit<KeyboardShortcut, 'action'>[] = [
  { key: '/', description: 'Focus search bar', category: 'logs' },
  { key: 'esc', description: 'Clear filters / close modals', category: 'general' },
  { key: 'space', description: 'Pause/resume log autoscroll', category: 'logs' },
  { key: 'm', description: 'Drop moment bookmark', category: 'logs' },
  { key: 'shift+/', description: 'Show keyboard shortcuts help', category: 'general' },
  { key: 't', description: 'Toggle dark mode', category: 'general' },
  { key: '1', description: 'Switch to container 1', category: 'navigation' },
  { key: '2', description: 'Switch to container 2', category: 'navigation' },
  { key: '3', description: 'Switch to container 3', category: 'navigation' },
  { key: '4', description: 'Switch to container 4', category: 'navigation' },
  { key: '5', description: 'Switch to container 5', category: 'navigation' },
  { key: '6', description: 'Switch to container 6', category: 'navigation' },
  { key: '7', description: 'Switch to container 7', category: 'navigation' },
  { key: '8', description: 'Switch to container 8', category: 'navigation' },
  { key: '9', description: 'Switch to container 9', category: 'navigation' },
];
