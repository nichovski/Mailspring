/* eslint global-require: 0*/
import React from 'react';
import fs from 'fs';
import { localized, MutedSendersStore, AccountStore } from 'mailspring-exports';
import ConfigSchemaItem from './config-schema-item';
import WorkspaceSection from './workspace-section';
import SendingSection from './sending-section';
import LanguageSection from './language-section';
import { ConfigLike, ConfigSchemaLike } from '../types';

class PreferencesGeneral extends React.Component<{
  config: ConfigLike;
  configSchema: ConfigSchemaLike;
}> {
  static displayName = 'PreferencesGeneral';

  _onReboot = () => {
    console.log('general relaunch');
    const app = require('@electron/remote').app;
    app.relaunch();
    app.quit();
  };

  _onResetEmailsThatIgnoreWarnings = () => {
    localStorage.removeItem('recipientWarningBlacklist');
  };

  _onResetAccountsAndSettings = () => {
    const chosen = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'info',
      message: localized('Are you sure?'),
      buttons: [localized('Cancel'), localized('Reset')],
    });

    if (chosen === 1) {
      fs.rm(AppEnv.getConfigDirPath(), { recursive: true, force: true }, (err) => {
        if (err) {
          return AppEnv.showErrorDialog(
            localized(
              `Could not reset accounts and settings. Please delete the folder %@ manually.\n\n%@`,
              AppEnv.getConfigDirPath(),
              err.toString()
            )
          );
        }
        this._onReboot();
      });
    }
  };

  _onResetEmailCache = () => {
    const ipc = require('electron').ipcRenderer;
    ipc.send('command', 'application:reset-database', {});
  };

  render() {
    const mutedSenders = MutedSendersStore.entries();
    return (
      <div className="container-general">
        <div className="two-columns-flexbox">
          <div style={{ flex: 1 }}>
            <WorkspaceSection config={this.props.config} configSchema={this.props.configSchema} />
            <LanguageSection config={this.props.config} configSchema={this.props.configSchema} />
          </div>
          <div style={{ width: 30 }} />
          <div style={{ flex: 1 }}>
            <ConfigSchemaItem
              configSchema={this.props.configSchema.properties.reading}
              keyName={localized('Reading')}
              keyPath="core.reading"
              config={this.props.config}
            />
            <section>
              <h6>{localized('Muted Senders')}</h6>
              <div className="platform-note">
                {localized(
                  'Right-click a sender in a message to mute them. Their existing and incoming messages are automatically marked as read without notifications for that account only while Mailspring is running.'
                )}
              </div>
              {mutedSenders.map(({ accountId, email }) => (
                <div className="item" key={`${accountId}:${email}`}>
                  <span>
                    {email} — {AccountStore.accountForId(accountId)?.emailAddress || accountId}
                  </span>{' '}
                  <button
                    className="btn"
                    onClick={() => MutedSendersStore.setMuted(accountId, email, false)}
                  >
                    {localized('Unmute')}
                  </button>
                </div>
              ))}
            </section>
          </div>
        </div>
        <div className="two-columns-flexbox" style={{ paddingTop: 30 }}>
          <div style={{ flex: 1 }}>
            <SendingSection config={this.props.config} configSchema={this.props.configSchema} />
            <div
              className="btn"
              onClick={this._onResetEmailsThatIgnoreWarnings}
              style={{ marginLeft: 0, marginTop: 5 }}
            >
              {localized('Reset Emails that Ignore Warnings')}
            </div>
          </div>
          <div style={{ width: 30 }} />
          <div style={{ flex: 1 }}>
            <ConfigSchemaItem
              configSchema={this.props.configSchema.properties.composing}
              keyName={localized('Composing')}
              keyPath="core.composing"
              config={this.props.config}
            />
          </div>
        </div>

        <div className="two-columns-flexbox" style={{ paddingTop: 30 }}>
          <div style={{ flex: 1 }}>
            <ConfigSchemaItem
              configSchema={this.props.configSchema.properties.notifications}
              keyName={localized('Notifications')}
              keyPath="core.notifications"
              config={this.props.config}
            />
          </div>
          <div style={{ width: 30 }} />
          <div style={{ flex: 1 }}>
            <ConfigSchemaItem
              configSchema={this.props.configSchema.properties.attachments}
              keyName={localized('Attachments')}
              keyPath="core.attachments"
              config={this.props.config}
            />
          </div>
        </div>

        <div className="local-data">
          <h6>{localized('Local Data')}</h6>
          <div className="btn" onClick={this._onResetEmailCache} style={{ marginLeft: 0 }}>
            {localized('Reset Cache')}
          </div>
          <div className="btn" onClick={this._onResetAccountsAndSettings}>
            {localized('Reset Accounts and Settings')}
          </div>
        </div>
      </div>
    );
  }
}

export default PreferencesGeneral;
