import { Folder, FocusedPerspectiveStore, MailboxPerspective } from 'mailspring-exports';
import ThreadListStore from '../lib/thread-list-store';

const folder = (role: string) =>
  new Folder({ id: role, role, path: role || 'label', accountId: TEST_ACCOUNT_ID });
const forRole = (role: string) => MailboxPerspective.forCategories([folder(role)]);

describe('ThreadListStore unread filter', function () {
  afterEach(() => {
    ThreadListStore._unreadOnly = false;
  });

  it('can filter an inbox and a label', function () {
    expect(ThreadListStore.canFilterUnread(forRole('inbox'))).toBe(true);
    expect(ThreadListStore.canFilterUnread(forRole(null))).toBe(true);
  });

  it('cannot filter spam, trash, starred or unread', function () {
    expect(ThreadListStore.canFilterUnread(forRole('spam'))).toBe(false);
    expect(ThreadListStore.canFilterUnread(forRole('trash'))).toBe(false);
    expect(ThreadListStore.canFilterUnread(MailboxPerspective.forStarred([TEST_ACCOUNT_ID]))).toBe(
      false
    );
    expect(ThreadListStore.canFilterUnread(MailboxPerspective.forUnread([folder('inbox')]))).toBe(
      false
    );
  });

  it('uses the unread perspective of the focused categories', function () {
    const inbox = forRole('inbox');
    spyOn(FocusedPerspectiveStore, 'current').andReturn(inbox);
    const forUnread = spyOn(MailboxPerspective, 'forUnread').andCallThrough();
    ThreadListStore.setUnreadOnly(true);
    expect(forUnread).toHaveBeenCalledWith(inbox.categories());
  });

  it('keeps the plain perspective where the filter is not available', function () {
    spyOn(FocusedPerspectiveStore, 'current').andReturn(
      MailboxPerspective.forStarred([TEST_ACCOUNT_ID])
    );
    const forUnread = spyOn(MailboxPerspective, 'forUnread').andCallThrough();
    ThreadListStore.setUnreadOnly(true);
    expect(forUnread).not.toHaveBeenCalled();
  });
});
