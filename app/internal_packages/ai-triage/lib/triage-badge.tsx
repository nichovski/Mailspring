import React from 'react';
import { localized, Thread } from 'mailspring-exports';
import TriageStore from './triage-store';
import { isScore, meterLevel, spamFlag, MeterLevel } from './triage-logic';

export const SparkleIcon = () => (
  <svg className="ai-triage-sparkle" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13 6.4 8.6 2 7l4.4-1.6z" fill="currentColor" />
  </svg>
);

const LEVEL_NAMES: { [level in MeterLevel]: () => string } = {
  High: () => localized('High'),
  Medium: () => localized('Medium'),
  Low: () => localized('Low'),
  'Very low': () => localized('Very low'),
};

export function spamLabel(kind: 'spam' | 'maybe', percent: number) {
  return kind === 'spam' ? localized('Spam %@%', percent) : localized('Maybe spam %@%', percent);
}

/** Attention meter and spam chip for one row of the thread list. */
export class TriageBadge extends React.Component<{ thread: Thread }> {
  static displayName = 'TriageBadge';
  static containerRequired = false;

  _unlisten?: () => void;

  componentDidMount() {
    this._unlisten = TriageStore.listen(() => this.forceUpdate());
  }

  componentWillUnmount() {
    this._unlisten?.();
  }

  render() {
    const entry = TriageStore.entry(this.props.thread.id);
    if (!TriageStore.enabled() || !isScore(entry)) {
      return false;
    }
    const { level, bars } = meterLevel(entry.a);
    const flag = spamFlag(entry, TriageStore.threshold());
    return (
      <span className="ai-triage-badge">
        <span
          className="ai-triage-meter"
          role="img"
          aria-label={localized('Attention: %@ (%@)', LEVEL_NAMES[level](), entry.a.toFixed(2))}
        >
          {[1, 2, 3, 4].map((n) => (
            <i key={n} className={n <= bars ? 'on' : ''} />
          ))}
        </span>
        {flag && (
          <span className={`ai-triage-chip ${flag.kind}`}>
            <SparkleIcon />
            {spamLabel(flag.kind, flag.percent)}
          </span>
        )}
      </span>
    );
  }
}
