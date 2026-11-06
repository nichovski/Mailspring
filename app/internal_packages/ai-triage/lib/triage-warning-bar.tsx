import React from 'react';
import { localized, Actions, MessageStore, TaskFactory, Thread } from 'mailspring-exports';
import TriageStore from './triage-store';
import { spamFlag } from './triage-logic';

const SOURCE = 'Smart triage warning';

const ShieldIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
    <path d="M12 8v5M12 16h.01" />
  </svg>
);

/** Shown above an open thread that is probably spam. */
export class TriageWarningBar extends React.Component<Record<string, never>, { thread?: Thread }> {
  static displayName = 'TriageWarningBar';
  static containerRequired = false;

  state = { thread: MessageStore.thread() as Thread | undefined };
  _unlisten: (() => void)[] = [];

  componentDidMount() {
    this._unlisten = [
      MessageStore.listen(() => this.setState({ thread: MessageStore.thread() })),
      TriageStore.listen(() => this.forceUpdate()),
    ];
  }

  componentWillUnmount() {
    this._unlisten.forEach((unlisten) => unlisten());
  }

  _onNotSpam = () => {
    TriageStore.setNotSpam(this.state.thread.id);
  };

  _onMove = (tasks: ReturnType<typeof TaskFactory.tasksForMarkingAsSpam>) => {
    Actions.queueTasks(tasks);
    Actions.popSheet();
  };

  render() {
    const { thread } = this.state;
    const flag =
      thread &&
      TriageStore.enabled() &&
      spamFlag(TriageStore.entry(thread.id), TriageStore.threshold());
    if (!flag) {
      return false;
    }
    const threads = [thread];
    return (
      <div className={`ai-triage-warning ${flag.kind}`}>
        <ShieldIcon />
        <div className="text">
          <span className="title">
            {flag.kind === 'spam'
              ? localized('%@% likely spam', flag.percent)
              : localized('Not sure: %@% chance this is spam', flag.percent)}
          </span>
          <span className="detail">
            {flag.kind === 'spam'
              ? localized('AI flagged this message.')
              : localized('That is below your spam setting, so it stays in your inbox.')}
          </span>
        </div>
        <button className="btn not-spam" onClick={this._onNotSpam}>
          {localized('Not spam')}
        </button>
        {flag.kind === 'spam' ? (
          <button
            className="btn action"
            onClick={() =>
              this._onMove(TaskFactory.tasksForMovingToTrash({ threads, source: SOURCE }))
            }
          >
            {localized('Delete')}
          </button>
        ) : (
          <button
            className="btn action"
            onClick={() =>
              this._onMove(TaskFactory.tasksForMarkingAsSpam({ threads, source: SOURCE }))
            }
          >
            {localized('Move to spam')}
          </button>
        )}
      </div>
    );
  }
}
