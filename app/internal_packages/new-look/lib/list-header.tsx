import React from 'react';
import {
  localized,
  MailboxPerspective,
  FocusedPerspectiveStore,
  ThreadCountsStore,
} from 'mailspring-exports';
import ThreadListStore from '../../thread-list/lib/thread-list-store';

export function countText(perspective: MailboxPerspective): string {
  const categories = perspective.categories();
  if (categories.length === 0) {
    return '';
  }
  let total = 0;
  let unread = 0;
  for (const { id } of categories) {
    total += ThreadCountsStore.totalCountForCategoryId(id) || 0;
    unread += ThreadCountsStore.unreadCountForCategoryId(id) || 0;
  }
  const text =
    total === 1
      ? localized('1 conversation')
      : localized('%@ conversations', total.toLocaleString());
  return unread > 0 ? `${text} · ${localized('%@ unread', unread.toLocaleString())}` : text;
}

/** Title, conversation count and All/Unread toggle above the thread list. */
export class ListHeader extends React.Component {
  static displayName = 'NewLookListHeader';
  static containerRequired = false;

  _unsubscribes: Array<() => void> = [];

  componentDidMount() {
    const update = () => this.forceUpdate();
    this._unsubscribes = [ThreadListStore.listen(update), ThreadCountsStore.listen(update)];
  }

  componentWillUnmount() {
    this._unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  render() {
    const perspective = FocusedPerspectiveStore.current();
    const unreadOnly = ThreadListStore.unreadOnly();
    return (
      <div className="new-look-list-header">
        <div className="title-row">
          <h1>{perspective.name}</h1>
          <span className="count">{countText(perspective)}</span>
        </div>
        {ThreadListStore.canFilterUnread(perspective) && (
          <div className="segmented">
            <button
              className={unreadOnly ? '' : 'on'}
              aria-pressed={!unreadOnly}
              onClick={() => ThreadListStore.setUnreadOnly(false)}
            >
              {localized('All')}
            </button>
            <button
              className={unreadOnly ? 'on' : ''}
              aria-pressed={unreadOnly}
              onClick={() => ThreadListStore.setUnreadOnly(true)}
            >
              {localized('Unread')}
            </button>
          </div>
        )}
      </div>
    );
  }
}
