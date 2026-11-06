import React from 'react';
import { localized, FocusedPerspectiveStore } from 'mailspring-exports';
import { Disposable } from 'event-kit';
import { SparkleIcon } from './triage-badge';
import { ThresholdSlider } from './threshold-slider';
import { ProbableSpamPerspective } from './triage-perspectives';

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
    const isSpamView = FocusedPerspectiveStore.current() instanceof ProbableSpamPerspective;
    return (
      <div className="ai-triage-bar">
        <div className="ai-triage-card">
          <button
            className="toggle"
            aria-expanded={expanded}
            onClick={() => this.setState({ expanded: !expanded })}
          >
            <SparkleIcon size={13} />
            <span className="title">{localized('Smart triage')}</span>
            <span className="summary">
              {localized('Spam above %@%', AppEnv.config.get('ai-triage.spamThreshold'))}
            </span>
            <svg
              className="chevron"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {expanded && (
            <div className="body">
              <label className="row">
                <span>{localized('Spam when above')}</span>
                <ThresholdSlider />
              </label>
              <div className="note">
                {isSpamView
                  ? localized('Nothing is deleted. Mark a message as not spam to move it back.')
                  : localized(
                      'Sorted by attention score. Mail above the spam setting moves to Probable spam.'
                    )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
