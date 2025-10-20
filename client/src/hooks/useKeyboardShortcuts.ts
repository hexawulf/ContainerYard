import { useEffect } from 'react';
import type { KeyboardShortcut } from '@shared/schema';

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focus is in form elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Check each shortcut
      for (const shortcut of shortcuts) {
        if (matchesShortcut(e, shortcut.key)) {
          e.preventDefault();
          shortcut.action();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);

  return shortcuts;
}

function matchesShortcut(e: KeyboardEvent, key: string): boolean {
  const parts = key.toLowerCase().split('+');
  const hasShift = parts.includes('shift');
  const hasCtrl = parts.includes('ctrl') || parts.includes('control');
  const hasAlt = parts.includes('alt');
  const hasMeta = parts.includes('meta') || parts.includes('cmd');

  // Get the actual key (last part or only part)
  const actualKey = parts.filter(p => !['shift', 'ctrl', 'control', 'alt', 'meta', 'cmd'].includes(p))[0];

  // Check modifiers
  if (hasShift !== e.shiftKey) return false;
  if (hasCtrl !== e.ctrlKey) return false;
  if (hasAlt !== e.altKey) return false;
  if (hasMeta !== e.metaKey) return false;

  // Check key
  const eventKey = e.key.toLowerCase();
  return eventKey === actualKey || e.code.toLowerCase() === actualKey.toLowerCase();
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
