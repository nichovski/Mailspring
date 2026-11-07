import React from 'react';
import { localized, Actions, DraftEditingSession, Message, MessageStore } from 'mailspring-exports';
import { SparkleIcon } from './triage-badge';
import ReadingStore from './reading-store';
import { replaceReplyText, textToHtml, Tone } from './reading-logic';

type Props = { draft: Message; session: DraftEditingSession };

const TONES: { tone: Tone; label: () => string }[] = [
  { tone: 'default', label: () => localized('Default') },
  { tone: 'shorter', label: () => localized('Shorter') },
  { tone: 'formal', label: () => localized('More formal') },
];

/** Tone, redo and discard controls under a draft that the AI wrote. */
export class AiDraftBar extends React.Component<Props, { busy: boolean; error: boolean }> {
  static displayName = 'AiDraftBar';

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

  _apply(text: string) {
    const { session } = this.props;
    session.changes.add({ body: replaceReplyText(session.draft().body, textToHtml(text)) });
    session.changes.commit();
  }

  _onTone = (tone: Tone) => {
    const { draft } = this.props;
    ReadingStore.setTone(draft, tone);
    this._apply(ReadingStore.aiDraft(draft).drafts[tone]);
  };

  _onRedo = async () => {
    const { draft } = this.props;
    if (MessageStore.threadId() !== draft.threadId) {
      return;
    }
    this.setState({ busy: true, error: false });
    try {
      const drafts = await ReadingStore.draft(MessageStore.thread(), MessageStore.items());
      ReadingStore.setDrafts(draft, drafts);
      this._apply(drafts[ReadingStore.aiDraft(draft).tone]);
    } catch (err) {
      if (this._mounted) this.setState({ error: true });
    } finally {
      if (this._mounted) this.setState({ busy: false });
    }
  };

  _onDiscard = () => {
    const { draft } = this.props;
    ReadingStore.clearAiDraft(draft);
    Actions.destroyDraft(draft);
  };

  render() {
    const ai = ReadingStore.aiDraft(this.props.draft);
    if (!ai) {
      return false;
    }
    const { busy, error } = this.state;
    return (
      <div className="ai-reading-draft">
        <SparkleIcon size={14} />
        <span className="note">
          {localized('Drafted by AI from this thread. Read it before you send.')}
        </span>
        {TONES.map(({ tone, label }) => (
          <button
            key={tone}
            aria-pressed={ai.tone === tone}
            disabled={busy}
            onClick={() => this._onTone(tone)}
          >
            {label()}
          </button>
        ))}
        <button disabled={busy} onClick={this._onRedo}>
          {busy ? localized('Drafting…') : localized('Redo draft')}
        </button>
        <button className="discard" onClick={this._onDiscard}>
          {localized('Discard')}
        </button>
        {error && <span className="error">{localized('Could not draft a reply. Try again.')}</span>}
      </div>
    );
  }
}
