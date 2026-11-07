import {
  localized,
  Actions,
  ComponentRegistry,
  FocusedPerspectiveStore,
  ExtensionRegistry,
  PreferencesUIStore,
  WorkspaceStore,
} from 'mailspring-exports';
import { TriageChip, TriageMeter } from './triage-badge';
import { TriageBar } from './triage-bar';
import { TriageWarningBar } from './triage-warning-bar';
import { AiSummaryCard } from './reading-summary';
import { AiReplySuggestions } from './reading-replies';
import { AiDraftBar } from './reading-draft-bar';
import { PriorityExtension, ProbableSpamExtension } from './triage-perspectives';
import TriageScorer from './triage-scorer';
import { Disposable } from 'event-kit';

export const config = {
  enabled: {
    type: 'boolean',
    default: false,
  },
  spamThreshold: {
    type: 'integer',
    default: 90,
    minimum: 50,
    maximum: 99,
  },
  reading: {
    type: 'boolean',
    default: false,
  },
};

let preferencesTab: any = null;
let enabledSubscription: Disposable | null = null;
let on = false;

function setOn(next: boolean) {
  if (next === on) {
    return;
  }
  on = next;
  if (next) {
    ExtensionRegistry.AccountSidebar.register(ProbableSpamExtension);
    ExtensionRegistry.AccountSidebar.register(PriorityExtension);
    if (AppEnv.isMainWindow()) {
      TriageScorer.start();
    }
  } else {
    ExtensionRegistry.AccountSidebar.unregister(PriorityExtension);
    ExtensionRegistry.AccountSidebar.unregister(ProbableSpamExtension);
    TriageScorer.stop();
    const current = FocusedPerspectiveStore.current();
    if (current && 'isAiTriage' in current) {
      Actions.focusDefaultMailboxPerspectiveForAccounts(current.accountIds);
    }
  }
}

export function activate() {
  ComponentRegistry.register(TriageMeter, { role: 'ThreadListBeforeTimestamp' });
  ComponentRegistry.register(TriageChip, { role: 'Thread:MailLabel' });
  ComponentRegistry.register(TriageWarningBar, { role: 'MessageListHeaders' });
  ComponentRegistry.register(TriageBar, { location: WorkspaceStore.Location.ThreadList });
  ComponentRegistry.register(AiSummaryCard, { role: 'MessageListHeaders' });
  ComponentRegistry.register(AiReplySuggestions, { role: 'MessageListReplyArea' });
  ComponentRegistry.register(AiDraftBar, { role: 'Composer:Footer' });

  preferencesTab = new PreferencesUIStore.TabItem({
    tabId: 'AiTriage',
    displayName: localized('Smart Triage'),
    componentClassFn: () => require('./preferences-triage').default,
    order: 11,
  });
  PreferencesUIStore.registerPreferencesTab(preferencesTab);

  enabledSubscription = AppEnv.config.observe('ai-triage.enabled', (value) => setOn(!!value));
}

export function deactivate() {
  enabledSubscription?.dispose();
  setOn(false);
  ComponentRegistry.unregister(TriageMeter);
  ComponentRegistry.unregister(TriageChip);
  ComponentRegistry.unregister(TriageWarningBar);
  ComponentRegistry.unregister(TriageBar);
  ComponentRegistry.unregister(AiSummaryCard);
  ComponentRegistry.unregister(AiReplySuggestions);
  ComponentRegistry.unregister(AiDraftBar);
  PreferencesUIStore.unregisterPreferencesTab(preferencesTab);
  preferencesTab = null;
}

export function serialize() {
  return {};
}
