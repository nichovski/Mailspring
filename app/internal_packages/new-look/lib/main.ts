import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
import { Disposable } from 'event-kit';
import { ThreadAvatar } from './thread-avatar';
import { SidebarHeader } from './sidebar-header';

const THEMES = ['ui-new-look', 'ui-new-look-dark'];

let on = false;
let subscription: Disposable | null = null;

function setOn(next: boolean) {
  if (next === on) {
    return;
  }
  on = next;
  if (next) {
    ComponentRegistry.register(ThreadAvatar, { role: 'ThreadListAvatar' });
    ComponentRegistry.register(SidebarHeader, { location: WorkspaceStore.Location.RootSidebar });
  } else {
    ComponentRegistry.unregister(ThreadAvatar);
    ComponentRegistry.unregister(SidebarHeader);
  }
}

const update = () => setOn(THEMES.includes(AppEnv.themes.getActiveTheme().name));

export function activate() {
  update();
  subscription = AppEnv.themes.onDidChangeActiveThemes(update);
}

export function deactivate() {
  subscription?.dispose();
  subscription = null;
  setOn(false);
}
