import React from 'react';
import { localized, Actions, MessageStore, TaskFactory, Thread } from 'mailspring-exports';
import TriageStore from './triage-store';
import { SparkleIcon } from './triage-badge';
import { spamFlag } from './triage-logic';

const SOURCE = 'Smart triage warning';

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
        <SparkleIcon />
        <span className="message">
          {flag.kind === 'spam'
            ? localized('%@% likely spam', flag.percent)
            : localized('Not sure: %@% chance this is spam', flag.percent)}
        </span>
        <button className="btn" onClick={this._onNotSpam}>
          {localized('Not spam')}
        </button>
        {flag.kind === 'spam' ? (
          <button
            className="btn btn-destructive"
            onClick={() =>
              this._onMove(TaskFactory.tasksForMovingToTrash({ threads, source: SOURCE }))
            }
          >
            {localized('Delete')}
          </button>
        ) : (
          <button
            className="btn"
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
