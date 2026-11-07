import { Message, Thread, DraftStore } from 'mailspring-exports';
import DraftFactory from '../../src/flux/stores/draft-factory';

describe('DraftStore._onComposeReply body', function () {
  let finalize: jasmine.Spy;

  const compose = (body?: string) =>
    DraftStore._onComposeReply({
      thread: new Thread({ id: 't' }),
      message: new Message({ id: 'm' }),
      type: 'reply',
      behavior: 'prefer-existing-if-pristine',
      body,
    });

  beforeEach(function () {
    spyOn(DraftStore, '_modelifyContext').andCallFake(({ thread, message }) =>
      Promise.resolve({ thread, message })
    );
    spyOn(DraftFactory, 'createOrUpdateDraftForReply').andCallFake(() =>
      Promise.resolve(new Message({ body: '<br/>Q', draft: true, pristine: true }))
    );
    finalize = spyOn(DraftStore, '_finalizeAndPersistNewMessage');
  });

  it('puts the body above the quoted text and marks the draft as edited', async function () {
    await compose('<b>x</b>');
    const draft = finalize.mostRecentCall.args[0];
    expect(draft.body).toBe('<b>x</b><br/>Q');
    expect(draft.pristine).toBe(false);
  });

  it('leaves the draft alone without a body', async function () {
    await compose();
    const draft = finalize.mostRecentCall.args[0];
    expect(draft.body).toBe('<br/>Q');
    expect(draft.pristine).toBe(true);
  });
});
