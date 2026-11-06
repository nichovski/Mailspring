import React from 'react';
import { localized, Thread } from 'mailspring-exports';
import TriageStore from './triage-store';
import { isScore, meterLevel, spamFlag, MeterLevel } from './triage-logic';

export const SparkleIcon = ({ size = 12 }: { size?: number }) => (
  <svg
    className="ai-triage-sparkle"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M11 2.5l1.9 5.1 5.1 1.9-5.1 1.9L11 16.5l-1.9-5.1L4 9.5l5.1-1.9z" />
    <path d="M18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" />
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

class TriageRowPart extends React.Component<{ thread: Thread }> {
  static containerRequired = false;

  _unlisten?: () => void;

  componentDidMount() {
    this._unlisten = TriageStore.listen(() => this.forceUpdate());
  }

  componentWillUnmount() {
    this._unlisten?.();
  }
}

/** Attention meter next to the time, shown only when the thread has no spam chip. */
export class TriageMeter extends TriageRowPart {
  static displayName = 'TriageMeter';

  render() {
    const entry = TriageStore.entry(this.props.thread.id);
    if (!TriageStore.enabled() || !isScore(entry) || spamFlag(entry, TriageStore.threshold())) {
      return false;
    }
    const { level, bars } = meterLevel(entry.a);
    const label = localized('Attention: %@ (%@)', LEVEL_NAMES[level](), entry.a.toFixed(2));
    return (
      <span
        className={`ai-triage-meter ${level === 'High' ? 'high' : ''}`}
        role="img"
        aria-label={label}
        title={label}
      >
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= bars ? 'on' : ''} />
        ))}
      </span>
    );
  }
}

/** Spam chip in the label row of a thread. */
export class TriageChip extends TriageRowPart {
  static displayName = 'TriageChip';

  render() {
    const entry = TriageStore.entry(this.props.thread.id);
    const flag = TriageStore.enabled() && spamFlag(entry, TriageStore.threshold());
    if (!flag) {
      return false;
    }
    return (
      <span className={`ai-triage-chip ${flag.kind}`}>
        <SparkleIcon size={10} />
        {spamLabel(flag.kind, flag.percent)}
      </span>
    );
  }
}
