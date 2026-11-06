import React from 'react';
import _ from 'underscore';
import { Disposable } from 'event-kit';

const KEY = 'ai-triage.spamThreshold';

/** Edits the spam threshold. Drags are local; the config is written once the drag pauses. */
export class ThresholdSlider extends React.Component<Record<string, never>, { value: number }> {
  static displayName = 'ThresholdSlider';

  state = { value: AppEnv.config.get(KEY) as number };
  _pending = false;
  _subscription?: Disposable;

  componentDidMount() {
    this._subscription = AppEnv.config.onDidChange(KEY, ({ newValue }) => {
      if (!this._pending) {
        this.setState({ value: newValue });
      }
    });
  }

  componentWillUnmount() {
    this._subscription?.dispose();
  }

  _commit = _.debounce((value: number) => {
    AppEnv.config.set(KEY, value);
    this._pending = false;
  }, 150);

  _onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    this._pending = true;
    this.setState({ value });
    this._commit(value);
  };

  render() {
    return (
      <div className="ai-triage-slider">
        <input type="range" min={50} max={99} value={this.state.value} onChange={this._onChange} />
        <span className="value">{this.state.value}%</span>
      </div>
    );
  }
}
