import { Folder, MailboxPerspective, ThreadCountsStore } from 'mailspring-exports';
import { countText } from '../lib/list-header';

const folder = (id: string) => new Folder({ id, path: id, accountId: TEST_ACCOUNT_ID });

function counts(total: { [id: string]: number }, unread: { [id: string]: number }) {
  spyOn(ThreadCountsStore, 'totalCountForCategoryId').andCallFake((id: string) => total[id]);
  spyOn(ThreadCountsStore, 'unreadCountForCategoryId').andCallFake((id: string) => unread[id]);
}

describe('New Look list header countText', function () {
  it('sums the counts of every category', function () {
    counts({ a: 1200, b: 34 }, { a: 5, b: 2 });
    const perspective = MailboxPerspective.forCategories([folder('a'), folder('b')]);
    expect(countText(perspective)).toBe(
      `${(1234).toLocaleString()} conversations · ${(7).toLocaleString()} unread`
    );
  });

  it('uses the singular and omits a zero unread count', function () {
    counts({ a: 1 }, { a: 0 });
    expect(countText(MailboxPerspective.forCategories([folder('a')]))).toBe('1 conversation');
  });

  it('is empty when the perspective has no categories', function () {
    expect(countText(MailboxPerspective.forStarred([TEST_ACCOUNT_ID]))).toBe('');
  });
});
