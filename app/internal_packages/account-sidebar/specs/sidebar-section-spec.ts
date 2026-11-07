import { Folder, MailboxPerspective } from 'mailspring-exports';
import SidebarItem from '../lib/sidebar-item';
import SidebarSection from '../lib/sidebar-section';
import { ISidebarItem } from '../lib/types';

const nothing = () => MailboxPerspective.forNothing();
const withChild = (item: ISidebarItem) => ({ ...item, children: [item] });
const category = (role: string) =>
  SidebarItem.forCategories([
    new Folder({ id: role, role, path: role || 'label', accountId: TEST_ACCOUNT_ID }),
  ]);
const perspectiveItem = (id: string, perspective: MailboxPerspective) =>
  SidebarItem.forPerspective(id, perspective);

describe('SidebarSection.flatSectionForAccounts', function () {
  beforeEach(() => {
    AppEnv.savedState.sidebarKeysCollapsed = {};
    const cat = new Folder({
      id: 'inbox',
      role: 'inbox',
      path: 'inbox',
      accountId: TEST_ACCOUNT_ID,
    });
    const items = [
      category('inbox'),
      category('important'),
      category('sent'),
      category('archive'),
      category('spam'),
      category('trash'),
      perspectiveItem('Unread', MailboxPerspective.forUnread([cat])),
      perspectiveItem('Starred', MailboxPerspective.forStarred([TEST_ACCOUNT_ID])),
      perspectiveItem('Drafts-undefined', MailboxPerspective.forDrafts([TEST_ACCOUNT_ID])),
      perspectiveItem('AiTriagePriority', nothing()),
      perspectiveItem('AiTriageProbableSpam', nothing()),
      category('snoozed'),
      perspectiveItem('Reminders', nothing()),
    ].map(withChild);
    spyOn(SidebarSection, 'standardSectionForAccounts').andReturn({ title: 'All Accounts', items });
  });

  it('orders rows like the design, drops Unread and clears children', function () {
    const { items } = SidebarSection.flatSectionForAccounts([]);
    expect(items.map((i) => i.id)).toEqual([
      'AiTriagePriority',
      'inbox',
      'Starred',
      'snoozed',
      'sent',
      'Drafts-undefined',
      'archive',
      'trash',
      'AiTriageProbableSpam',
      'important',
      'spam',
      'Reminders',
    ]);
    expect(items.every((i) => i.children.length === 0)).toBe(true);
  });
});
