import React from 'react';
import { localized } from 'mailspring-exports';
import { Switch } from 'mailspring-component-kit';
import { Disposable } from 'event-kit';
import { ThresholdSlider } from './threshold-slider';

export default class PreferencesTriage extends React.Component<
  Record<string, never>,
  { enabled: boolean; reading: boolean }
> {
  static displayName = 'PreferencesTriage';

  state = {
    enabled: !!AppEnv.config.get('ai-triage.enabled'),
    reading: !!AppEnv.config.get('ai-triage.reading'),
  };
  _subscriptions: Disposable[] = [];

  componentDidMount() {
    this._subscriptions = [
      AppEnv.config.onDidChange('ai-triage.enabled', ({ newValue }) =>
        this.setState({ enabled: !!newValue })
      ),
      AppEnv.config.onDidChange('ai-triage.reading', ({ newValue }) =>
        this.setState({ reading: !!newValue })
      ),
    ];
  }

  componentWillUnmount() {
    this._subscriptions.forEach((s) => s.dispose());
  }

  render() {
    const { enabled, reading } = this.state;
    return (
      <div className="container-ai-triage">
        <section>
          <h6>{localized('Smart Triage')}</h6>
          <p>
            {localized(
              'Scores new inbox mail for spam and attention. Adds Priority and Probable spam views and a meter in the thread list.'
            )}
          </p>
          <div className="toggle-row">
            <Switch
              checked={enabled}
              onChange={() => AppEnv.config.set('ai-triage.enabled', !enabled)}
              label={localized('Enable Smart Triage')}
            />
            <span>{localized('Enable Smart Triage')}</span>
          </div>
          <p className="note">
            {localized(
              'The sender, subject and start of each new inbox message are sent to the Mailspring backend for scoring by an AI provider.'
            )}
          </p>
          <label className="threshold-label">{localized('Spam threshold')}</label>
          <ThresholdSlider />
        </section>
        <section>
          <h6>{localized('Summaries and replies')}</h6>
          <p>
            {localized(
              'Shows a summary, action items and suggested replies for the conversation you open, and can draft a reply.'
            )}
          </p>
          <div className="toggle-row">
            <Switch
              checked={reading}
              onChange={() => AppEnv.config.set('ai-triage.reading', !reading)}
              label={localized('Enable summaries and replies')}
            />
            <span>{localized('Enable summaries and replies')}</span>
          </div>
          <p className="note">
            {localized(
              'The text of the conversation you open (up to the last 8 messages, without quoted text) is sent to the Mailspring backend and an AI provider.'
            )}
          </p>
        </section>
      </div>
    );
  }
}
