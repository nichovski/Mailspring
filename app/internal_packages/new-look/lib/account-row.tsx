import React from 'react';
import { Account, AccountStore, FocusedPerspectiveStore, localized } from 'mailspring-exports';
import { showAccountMenu } from '../../account-sidebar/lib/components/account-switcher';

const MAX_AVATARS = 2;

export function accountSummary(accounts: Account[], sidebarAccountIds: string[]) {
  const shown = accounts.filter((a) => sidebarAccountIds.includes(a.id));
  const avatars = shown.slice(0, MAX_AVATARS);
  const more = shown.length - avatars.length;
  if (shown.length === 1) {
    const [{ label, emailAddress }] = shown;
    return { title: label, subtitle: emailAddress === label ? '' : emailAddress, avatars, more };
  }
  const subtitle =
    shown.length === 2
      ? localized('%@ and %@', shown[0].label, shown[1].label)
      : localized('%@ accounts', shown.length);
  return { title: localized('All inboxes'), subtitle, avatars, more };
}

/** Shows which accounts the sidebar covers and opens the account menu. */
export class AccountRow extends React.Component {
  static displayName = 'NewLookAccountRow';
  static containerRequired = false;

  _unsubscribes: Array<() => void> = [];

  componentDidMount() {
    const update = () => this.forceUpdate();
    this._unsubscribes = [AccountStore.listen(update), FocusedPerspectiveStore.listen(update)];
  }

  componentWillUnmount() {
    this._unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  render() {
    const accounts = AccountStore.accounts();
    const ids = FocusedPerspectiveStore.sidebarAccountIds();
    const { title, subtitle, avatars, more } = accountSummary(accounts, ids);
    return (
      <button
        className="account-row"
        aria-haspopup="menu"
        onClick={() => showAccountMenu(accounts, ids)}
      >
        <span className="avatars">
          {avatars.map((a) => (
            <span key={a.id} className="avatar" style={{ background: a.color || undefined }}>
              {(a.label || a.emailAddress).charAt(0).toUpperCase()}
            </span>
          ))}
          {more > 0 && <span className="avatar more">+{more}</span>}
        </span>
        <span className="text">
          <span className="title">{title}</span>
          {subtitle && <span className="subtitle">{subtitle}</span>}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    );
  }
}
