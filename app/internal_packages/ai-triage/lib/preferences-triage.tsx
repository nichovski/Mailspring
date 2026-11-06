import React from 'react';
import { localized } from 'mailspring-exports';
import { Switch } from 'mailspring-component-kit';
import { Disposable } from 'event-kit';
import { ThresholdSlider } from './threshold-slider';

export default class PreferencesTriage extends React.Component<
  Record<string, never>,
  { enabled: boolean }
> {
  static displayName = 'PreferencesTriage';

  state = { enabled: !!AppEnv.config.get('ai-triage.enabled') };
  _subscription?: Disposable;

  componentDidMount() {
    this._subscription = AppEnv.config.onDidChange('ai-triage.enabled', ({ newValue }) =>
      this.setState({ enabled: !!newValue })
    );
  }

  componentWillUnmount() {
    this._subscription?.dispose();
  }

  render() {
    const { enabled } = this.state;
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
      </div>
    );
  }
}
