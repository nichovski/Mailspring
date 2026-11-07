import { Account } from 'mailspring-exports';
import { accountSummary } from '../lib/account-row';

const account = (id: string, label: string, emailAddress = `${id}@example.com`) =>
  new Account({ id, label, emailAddress });

describe('New Look accountSummary', function () {
  it('names two accounts', function () {
    const accounts = [account('a', 'Work'), account('b', 'Home')];
    const s = accountSummary(accounts, ['a', 'b']);
    expect(s.title).toBe('All inboxes');
    expect(s.subtitle).toBe('Work and Home');
    expect(s.avatars.length).toBe(2);
    expect(s.more).toBe(0);
  });

  it('counts many accounts and caps the avatars', function () {
    const accounts = Array.from({ length: 20 }, (_, i) => account(`a${i}`, `L${i}`));
    const s = accountSummary(
      accounts,
      accounts.map((a) => a.id)
    );
    expect(s.subtitle).toBe('20 accounts');
    expect(s.avatars.length).toBe(2);
    expect(s.more).toBe(18);
  });

  it('shows the label and email for one account', function () {
    const s = accountSummary([account('a', 'Work'), account('b', 'Home')], ['a']);
    expect(s.title).toBe('Work');
    expect(s.subtitle).toBe('a@example.com');
    expect(s.more).toBe(0);
  });

  it('omits the subtitle when the label is the email', function () {
    const s = accountSummary([account('a', 'a@example.com')], ['a']);
    expect(s.subtitle).toBe('');
  });
});
