import React from 'react';
import { Actions, AccountStore, DateUtils, localized } from 'mailspring-exports';
import { SparkleIcon } from './triage-badge';
import DayStore from './day-store';
import { PriorityPerspective } from './triage-perspectives';

const RECHECK_MS = 5 * 60_000;
const COLLAPSED = 'ai-triage.dayCollapsed';

/** The "Your day" brief in the New Look sidebar. */
export class DayCard extends React.Component {
  static displayName = 'AiDayCard';
  static containerRequired = false;

  _unlisten?: () => void;
  _interval?: ReturnType<typeof setInterval>;
  _collapsed?: { dispose(): void };

  componentDidMount() {
    this._unlisten = DayStore.listen(() => this.forceUpdate());
    this._collapsed = AppEnv.config.onDidChange(COLLAPSED, () => this.forceUpdate());
    DayStore.refresh();
    this._interval = setInterval(() => DayStore.refresh(), RECHECK_MS);
  }

  componentWillUnmount() {
    this._unlisten?.();
    this._collapsed?.dispose();
    clearInterval(this._interval);
  }

  render() {
    const brief = DayStore.current();
    if (!brief && !DayStore.loading() && !DayStore.quiet()) {
      return false;
    }
    const collapsed = !!AppEnv.config.get(COLLAPSED);
    return (
      <section className="ai-day-card" aria-label={localized('Your day')}>
        <div className="head">
          <SparkleIcon size={14} />
          <span className="title">{localized('Your day')}</span>
          {brief && <span className="time">{DateUtils.shortTimeString(new Date(brief.t))}</span>}
          {/* An icon, not a word: the narrow sidebar has no room for "Hide" next to the time. */}
          <button
            className="toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? localized('Show') : localized('Hide')}
            title={collapsed ? localized('Show') : localized('Hide')}
            onClick={() => AppEnv.config.set(COLLAPSED, !collapsed)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={collapsed ? 'm6 9 6 6 6-6' : 'm6 15 6-6 6 6'} />
            </svg>
          </button>
        </div>
        {!collapsed && this._body(brief)}
      </section>
    );
  }

  _body(brief: ReturnType<typeof DayStore.current>) {
    return (
      <>
        <p aria-live="polite">
          {brief
            ? brief.brief
            : DayStore.loading()
              ? localized('Reading your mail…')
              : localized('Nothing needs you right now.')}
        </p>
        <button
          className="go"
          onClick={() =>
            Actions.focusMailboxPerspective(new PriorityPerspective(AccountStore.accountIds()))
          }
        >
          {localized('Show what needs me')}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </>
    );
  }
}
