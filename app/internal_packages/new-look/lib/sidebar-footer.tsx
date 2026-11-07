import React from 'react';
import { Actions, AccountStore, FolderSyncProgressStore, localized } from 'mailspring-exports';
import { ipcRenderer } from 'electron';

/** Sync status, Add Account and Preferences at the bottom of the sidebar. */
export class SidebarFooter extends React.Component {
  static displayName = 'NewLookSidebarFooter';
  static containerRequired = false;

  _unsubscribes: Array<() => void> = [];

  componentDidMount() {
    const update = () => this.forceUpdate();
    this._unsubscribes = [FolderSyncProgressStore.listen(update), AccountStore.listen(update)];
  }

  componentWillUnmount() {
    this._unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  render() {
    let state = 'ok';
    let status = localized('Up to date');
    if (AccountStore.accounts().some((a) => a.hasSyncStateError())) {
      state = 'error';
      status = localized('Sync error');
    } else if (FolderSyncProgressStore.getSummary().phrase) {
      state = 'busy';
      status = localized('Syncing');
    }
    return (
      <div className="new-look-sidebar-footer">
        <span className={`dot ${state}`} aria-hidden="true" />
        <span className="status">{status}</span>
        <button
          aria-label={localized('Add Account')}
          onClick={() => ipcRenderer.send('command', 'application:add-account')}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button aria-label={localized('Preferences')} onClick={() => Actions.openPreferences()}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
            <circle cx="16" cy="6" r="2" />
            <circle cx="10" cy="12" r="2" />
            <circle cx="18" cy="18" r="2" />
          </svg>
        </button>
      </div>
    );
  }
}
