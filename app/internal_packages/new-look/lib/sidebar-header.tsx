import React from 'react';
import { Actions, localized } from 'mailspring-exports';
import { AccountRow } from './account-row';

// The key hint shows only a plain single-key binding, such as "c" in the Gmail keymap.
function composeKey(): string | null {
  const bindings: string[] = AppEnv.keymaps.getBindingsForCommand('application:new-message');
  const first = bindings[0];
  return first && first.length === 1 ? first.toUpperCase() : null;
}

/** Brand row and Compose button above the account sidebar. */
export class SidebarHeader extends React.Component {
  static displayName = 'NewLookSidebarHeader';
  static containerRequired = false;

  render() {
    const key = composeKey();
    return (
      <div className="new-look-sidebar-header">
        <div className="brand">
          <span className="brand-mark">
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
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="m4 7 8 6 8-6" />
            </svg>
          </span>
          <span className="brand-name">Bogdan's mail</span>
        </div>
        <AccountRow />
        <button
          className="compose"
          title={localized('Compose new message')}
          onClick={() => Actions.composeNewBlankDraft()}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 20h4L19 9l-4-4L4 16z" />
            <path d="m13.5 6.5 4 4" />
          </svg>
          <span>{localized('Compose')}</span>
          {key && <kbd>{key}</kbd>}
        </button>
      </div>
    );
  }
}
