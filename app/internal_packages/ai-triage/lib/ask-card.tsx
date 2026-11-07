import React from 'react';
import { Actions, localized } from 'mailspring-exports';
import { SparkleIcon } from './triage-badge';
import AskStore from './ask-store';

/** The Ask badge inside the search bar. Enter still runs a plain search. */
export class AskButton extends React.Component<{ query?: string }> {
  static displayName = 'AiAskButton';
  static containerRequired = false;

  _unlisten?: () => void;

  componentDidMount() {
    this._unlisten = AskStore.listen(() => this.forceUpdate());
  }

  componentWillUnmount() {
    this._unlisten?.();
  }

  _onClick = () => {
    const { query } = this.props;
    if (query && query.trim()) {
      (document.activeElement as HTMLElement)?.blur();
      AskStore.ask(query);
    }
  };

  render() {
    const status = AskStore.current()?.status;
    const busy = status === 'searching' || status === 'answering';
    return (
      <button
        className="ai-ask-button"
        title={localized('Ask about your mail')}
        disabled={busy}
        // Keeps focus in the field, so its blur handler does not wipe the query.
        onMouseDown={(e) => e.preventDefault()}
        onClick={this._onClick}
      >
        <SparkleIcon size={12} />
        {localized('Ask')}
      </button>
    );
  }
}

/** The answer above the list while an ask is active. */
export class AskCard extends React.Component {
  static displayName = 'AiAskCard';
  static containerRequired = false;

  _unlisten?: () => void;

  componentDidMount() {
    this._unlisten = AskStore.listen(() => this.forceUpdate());
  }

  componentWillUnmount() {
    this._unlisten?.();
  }

  _onClear = () => {
    AskStore.clear();
    Actions.searchQuerySubmitted('');
  };

  render() {
    const ask = AskStore.current();
    if (!ask) {
      return false;
    }
    const waiting = ask.status === 'searching' || ask.status === 'answering';
    return (
      <section className="ai-ask-card" aria-label={localized('AI answer')}>
        <div className="head">
          <SparkleIcon size={14} />
          <span className="title">{localized('Answer')}</span>
          <button className="clear" onClick={this._onClear}>
            {localized('Clear')}
          </button>
        </div>
        <p aria-live="polite" className={ask.status === 'error' ? 'error' : ''}>
          {waiting ? localized('Looking through your mail…') : ask.answer}
        </p>
        {ask.sources && ask.sources.length > 0 && (
          <div className="sources">
            <span className="label">{localized('From these emails')}</span>
            {ask.sources.map((thread) => (
              <button
                className="source"
                key={thread.id}
                onClick={() => Actions.setFocus({ collection: 'thread', item: thread })}
              >
                <span className="subject">{thread.subject || localized('(No Subject)')}</span>
                <span className="date">
                  {thread.lastMessageReceivedTimestamp.toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </button>
            ))}
          </div>
        )}
        {ask.pills && ask.pills.length > 0 && (
          <div className="pills">
            <span className="label">{localized('Searched for')}</span>
            {ask.pills.map((pill) => (
              <span className="pill" key={pill}>
                {pill}
              </span>
            ))}
          </div>
        )}
      </section>
    );
  }
}
