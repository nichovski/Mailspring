import React from 'react';
import { localized, Actions, Message, MessageStore, Thread } from 'mailspring-exports';
import { SparkleIcon } from './triage-badge';
import ReadingStore, { triageFlagged } from './reading-store';
import { lastMessage, textToHtml } from './reading-logic';

type Props = { thread?: Thread; messages?: Message[]; replyType: 'reply' | 'reply-all' };

/** Suggested reply chips and "Draft with AI" above the reply buttons. */
export class AiReplySuggestions extends React.Component<Props, { busy: boolean; error: boolean }> {
  static displayName = 'AiReplySuggestions';
  static containerRequired = false;

  state = { busy: false, error: false };
  _mounted = false;
  _unlisten?: () => void;

  componentDidMount() {
    this._mounted = true;
    this._unlisten = ReadingStore.listen(() => this.forceUpdate());
  }

  componentWillUnmount() {
    this._mounted = false;
    this._unlisten?.();
  }

  _compose(last: Message, text: string) {
    const { thread, replyType } = this.props;
    Actions.composeReply({
      thread,
      message: last,
      type: replyType,
      behavior: 'prefer-existing-if-pristine',
      body: textToHtml(text),
    });
  }

  _onDraft = async (last: Message) => {
    const { thread, messages } = this.props;
    this.setState({ busy: true, error: false });
    try {
      const drafts = await ReadingStore.draft(thread, messages);
      if (MessageStore.threadId() !== thread.id) {
        return;
      }
      ReadingStore.setAiDraft(last.headerMessageId, drafts);
      this._compose(last, drafts.default);
    } catch (err) {
      if (this._mounted) this.setState({ error: true });
    } finally {
      if (this._mounted) this.setState({ busy: false });
    }
  };

  render() {
    const { thread, messages } = this.props;
    const last = thread && lastMessage(messages || []);
    if (
      !last ||
      !ReadingStore.available() ||
      triageFlagged(thread.id) ||
      !AppEnv.config.get('core.composing.html')
    ) {
      return false;
    }
    const summary = ReadingStore.summary(thread.id, last.id);
    const { busy, error } = this.state;
    return (
      <div className="ai-reading-replies">
        <span role="img" aria-label={localized('Suggested replies')} className="sparkle">
          <SparkleIcon size={14} />
        </span>
        {(summary?.replies || []).map((text, i) => (
          <button key={i} className="chip" onClick={() => this._compose(last, text)}>
            {text}
          </button>
        ))}
        <span className="spacer" />
        {error && <span className="error">{localized('Could not draft a reply. Try again.')}</span>}
        <button className="draft" disabled={busy} onClick={() => this._onDraft(last)}>
          <SparkleIcon size={15} />
          {busy ? localized('Drafting…') : localized('Draft with AI')}
        </button>
      </div>
    );
  }
}
