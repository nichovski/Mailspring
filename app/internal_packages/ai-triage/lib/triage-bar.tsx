import React from 'react';
import { localized, FocusedPerspectiveStore } from 'mailspring-exports';
import { Disposable } from 'event-kit';
import { SparkleIcon } from './triage-badge';
import { ThresholdSlider } from './threshold-slider';

/** Collapsible spam-threshold control above the Priority and Probable spam lists. */
export class TriageBar extends React.Component<Record<string, never>, { expanded: boolean }> {
  static displayName = 'TriageBar';
  static containerRequired = false;

  state = { expanded: false };
  _unlisten?: () => void;
  _subscription?: Disposable;

  componentDidMount() {
    this._unlisten = FocusedPerspectiveStore.listen(() => this.forceUpdate());
    this._subscription = AppEnv.config.onDidChange('ai-triage.spamThreshold', () =>
      this.forceUpdate()
    );
  }

  componentWillUnmount() {
    this._unlisten?.();
    this._subscription?.dispose();
  }

  render() {
    if (!(FocusedPerspectiveStore.current() as { isAiTriage?: boolean }).isAiTriage) {
      return false;
    }
    const { expanded } = this.state;
    return (
      <div className="ai-triage-bar">
        <button
          className="toggle"
          aria-expanded={expanded}
          onClick={() => this.setState({ expanded: !expanded })}
        >
          <SparkleIcon />
          {localized('Smart triage')}
          {!expanded && (
            <span className="summary">
              {' · '}
              {localized('Spam above %@%', AppEnv.config.get('ai-triage.spamThreshold'))}
            </span>
          )}
        </button>
        {expanded && (
          <div className="body">
            <ThresholdSlider />
            <div className="note">
              {localized(
                'Mail scored at or above this goes to Probable spam. Changes apply at once.'
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
}
