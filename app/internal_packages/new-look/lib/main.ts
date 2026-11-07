import { ComponentRegistry, ExtensionRegistry, WorkspaceStore } from 'mailspring-exports';
import { Disposable } from 'event-kit';
import { ThreadAvatar } from './thread-avatar';
import { SidebarHeader } from './sidebar-header';
import { SidebarFooter } from './sidebar-footer';
import { ListHeader } from './list-header';
import ThreadListStore from '../../thread-list/lib/thread-list-store';

const THEMES = ['ui-new-look', 'ui-new-look-dark'];

// Makes SidebarStore build the flat list; see SidebarSection.flatSectionForAccounts.
const FlatSidebar = { name: 'NewLookFlatSidebar', flatSidebar: true };

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
    ComponentRegistry.register(SidebarFooter, { location: WorkspaceStore.Location.RootSidebar });
    ComponentRegistry.register(ListHeader, {
      locations: [WorkspaceStore.Location.ThreadList, WorkspaceStore.Location.DraftList],
    });
    ExtensionRegistry.AccountSidebar.register(FlatSidebar);
  } else {
    ComponentRegistry.unregister(ThreadAvatar);
    ComponentRegistry.unregister(SidebarHeader);
    ComponentRegistry.unregister(SidebarFooter);
    ComponentRegistry.unregister(ListHeader);
    ExtensionRegistry.AccountSidebar.unregister(FlatSidebar);
    ThreadListStore.setUnreadOnly(false);
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
