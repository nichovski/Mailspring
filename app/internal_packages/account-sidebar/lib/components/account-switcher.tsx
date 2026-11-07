import React from 'react';
import { Account, localized, Actions } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { ipcRenderer } from 'electron';
import * as AccountCommands from '../account-commands';

export function showAccountMenu(accounts: Account[], sidebarAccountIds: string[]) {
  const template = AccountCommands.menuTemplate(accounts, sidebarAccountIds, {
    clickHandlers: true,
  }).concat([
    { type: 'separator' },
    {
      label: `${localized('Add Account')}...`,
      click: () => ipcRenderer.send('command', 'application:add-account'),
    },
    {
      label: `${localized('Manage Accounts')}...`,
      click: () => {
        Actions.switchPreferencesTab('Accounts');
        Actions.openPreferences();
      },
    },
  ]);
  require('@electron/remote').Menu.buildFromTemplate(template).popup({});
}

export default class AccountSwitcher extends React.Component<{
  accounts: Account[];
  sidebarAccountIds: string[];
}> {
  static displayName = 'AccountSwitcher';

  _onShowMenu = () => showAccountMenu(this.props.accounts, this.props.sidebarAccountIds);

  _onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._onShowMenu();
    }
  };

  render() {
    return (
      <div
        className="account-switcher"
        role="button"
        tabIndex={0}
        aria-label={localized('Account switcher')}
        aria-haspopup="menu"
        onMouseDown={this._onShowMenu}
        onKeyDown={this._onKeyDown}
      >
        <RetinaImg
          style={{ width: 13, height: 14 }}
          name="account-switcher-dropdown.png"
          mode={RetinaImg.Mode.ContentDark}
          alt=""
        />
      </div>
    );
  }
}
