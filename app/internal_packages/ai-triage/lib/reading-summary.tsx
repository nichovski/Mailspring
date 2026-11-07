import React from 'react';
import { localized, Message, Thread } from 'mailspring-exports';
import { SparkleIcon } from './triage-badge';
import ReadingStore, { triageFlagged } from './reading-store';
import TriageStore from './triage-store';
import { lastMessage } from './reading-logic';

// Thread ids whose summary the user collapsed, kept while the window is open.
const hidden = new Set<string>();

/** Summary, action items and the AI note above the messages of an open thread. */
export class AiSummaryCard extends React.Component<{ thread?: Thread; messages?: Message[] }> {
  static displayName = 'AiSummaryCard';
  static containerRequired = false;

  _unlisten: (() => void)[] = [];

  componentDidMount() {
    this._unlisten = [
      ReadingStore.listen(() => this.forceUpdate()),
      TriageStore.listen(() => this.forceUpdate()),
    ];
  }

  componentWillUnmount() {
    this._unlisten.forEach((unlisten) => unlisten());
  }

  _toggle = () => {
    const { id } = this.props.thread;
    if (!hidden.delete(id)) {
      hidden.add(id);
    }
    this.forceUpdate();
  };

  render() {
    const { thread, messages } = this.props;
    const last = thread && lastMessage(messages || []);
    if (!last || !ReadingStore.available() || triageFlagged(thread.id)) {
      return false;
    }
    const summary = ReadingStore.summary(thread.id, last.id);
    if (!summary) {
      return ReadingStore.loading(thread.id) ? (
        <section className="ai-reading-summary" aria-label={localized('AI summary')}>
          <div className="head">
            <SparkleIcon size={15} />
            <span className="title">{localized('Summary')}</span>
            <span className="meta">{localized('Summarizing…')}</span>
          </div>
        </section>
      ) : (
        false
      );
    }
    const open = !hidden.has(thread.id);
    const done = new Set(summary.d || []);
    return (
      <section className="ai-reading-summary" aria-label={localized('AI summary')}>
        <div className="head">
          <SparkleIcon size={15} />
          <span className="title">{localized('Summary')}</span>
          <span className="meta">
            {summary.n === 1 ? localized('of 1 message') : localized('of %@ messages', summary.n)}
          </span>
          <button className="toggle" aria-expanded={open} onClick={this._toggle}>
            {open ? localized('Hide') : localized('Show')}
          </button>
        </div>
        {open && (
          <div className="body">
            <ul>
              {summary.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
            {summary.actions.length > 0 && (
              <div className="actions">
                <div className="for-you">{localized('For you')}</div>
                {summary.actions.map((action, i) => (
                  <div key={i} className={`action${done.has(i) ? ' done' : ''}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={done.has(i)}
                        onChange={() => ReadingStore.toggleDone(thread.id, i)}
                      />
                      <span>{action.text}</span>
                    </label>
                    {action.due && <span className="due">{action.due}</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="note">
              {localized(
                'Made by AI, so it can be wrong. Check the messages for anything important.'
              )}
            </div>
          </div>
        )}
      </section>
    );
  }
}
