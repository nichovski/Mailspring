import fs from 'fs';
import path from 'path';
import _ from 'underscore';
import MailspringStore from 'mailspring-store';
import { parseScores, TriageEntry } from './triage-logic';

const MAX_ENTRIES = 5000;

/**
 * Scores live in a local file, not in thread metadata: metadata rewrites the whole
 * backend file on every write and fans a change record to every open list. Scores
 * stay on this device and survive turning the feature off.
 */
class TriageStore extends MailspringStore {
  _entries: Map<string, TriageEntry> | null = null;

  constructor() {
    super();
    AppEnv.config.onDidChange('ai-triage.spamThreshold', () => this.trigger());
  }

  _file() {
    return path.join(AppEnv.getConfigDirPath(), 'ai-triage-scores.json');
  }

  _all() {
    if (!this._entries) {
      try {
        this._entries = parseScores(JSON.parse(fs.readFileSync(this._file(), 'utf8')));
      } catch (err) {
        this._entries = new Map();
      }
    }
    return this._entries;
  }

  enabled(): boolean {
    return !!AppEnv.config.get('ai-triage.enabled');
  }

  /** The spam threshold as a fraction. */
  threshold(): number {
    return (AppEnv.config.get('ai-triage.spamThreshold') || 90) / 100;
  }

  entry = (threadId: string): TriageEntry | undefined => this._all().get(threadId);

  has(threadId: string) {
    return this._all().has(threadId);
  }

  setScore(threadId: string, s: number, a: number) {
    this._set(threadId, { s, a });
  }

  setFailed(threadId: string) {
    this._set(threadId, { f: 1 });
  }

  setNotSpam(threadId: string) {
    const entry = this.entry(threadId);
    if (entry && 's' in entry) {
      this._set(threadId, { ...entry, o: 'ham' });
    }
  }

  _set(threadId: string, entry: TriageEntry) {
    const all = this._all();
    all.delete(threadId);
    all.set(threadId, entry);
    if (all.size > MAX_ENTRIES) {
      all.delete(all.keys().next().value);
    }
    this._save();
    this._triggerSoon();
  }

  _triggerSoon = _.debounce(() => this.trigger(), 250);

  _save = _.debounce(() => {
    const scores = {};
    this._all().forEach((entry, id) => {
      scores[id] = entry;
    });
    const tmp = `${this._file()}.tmp`;
    fs.writeFile(tmp, JSON.stringify({ v: 1, scores }), (writeErr) => {
      if (writeErr) {
        console.warn('ai-triage: could not save scores', writeErr);
        return;
      }
      fs.rename(tmp, this._file(), (renameErr) => {
        if (renameErr) {
          console.warn('ai-triage: could not save scores', renameErr);
        }
      });
    });
  }, 2000);
}

export default new TriageStore();
