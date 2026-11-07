import fs from 'fs';
import path from 'path';
import MailspringStore from 'mailspring-store';
import { AccountStore, MailspringAPIRequest, Thread } from 'mailspring-exports';
import TriageStore from './triage-store';
import { inboxQuery } from './triage-perspectives';
import {
  DayBrief,
  MAX_THREADS,
  mailItems,
  parseDayFile,
  periodStart,
  pickDay,
  toBrief,
  todayString,
} from './assistant-logic';

/**
 * One "Your day" brief per day period, which starts at 06:00 local time. A period gets one attempt:
 * a failure is not retried until the next period or a restart. Nothing is asked until every
 * candidate thread has a triage score, and only sender, subject and a 400-char snippet of at most
 * 8 conversations leave the device. The brief is saved so a restart does not ask again.
 */
class DayStore extends MailspringStore {
  _brief: DayBrief | null | undefined = undefined;
  _loading = false;
  _quiet = false;
  _tried = 0;

  _file() {
    return path.join(AppEnv.getConfigDirPath(), 'ai-day.json');
  }

  _saved(): DayBrief | null {
    if (this._brief === undefined) {
      try {
        this._brief = parseDayFile(JSON.parse(fs.readFileSync(this._file(), 'utf8')));
      } catch (err) {
        this._brief = null;
      }
    }
    return this._brief;
  }

  current(now = new Date()): DayBrief | null {
    const brief = this._saved();
    return brief && brief.t >= periodStart(now) ? brief : null;
  }

  loading() {
    return this._loading;
  }

  quiet() {
    return this._quiet;
  }

  async _inbox(): Promise<Thread[]> {
    return inboxQuery(AccountStore.accountIds());
  }

  _items(threads: Thread[]) {
    return mailItems(threads);
  }

  _post(path: string, body: object, timeout: number) {
    return MailspringAPIRequest.makeRequest({
      server: 'identity',
      method: 'POST',
      path,
      json: true,
      body,
      timeout,
    });
  }

  _save(brief: DayBrief) {
    const tmp = `${this._file()}.tmp`;
    fs.writeFile(tmp, JSON.stringify({ v: 1, ...brief }), (writeErr) => {
      if (writeErr) {
        console.warn('ai-day: could not save the brief', writeErr);
        return;
      }
      fs.rename(tmp, this._file(), (renameErr) => {
        if (renameErr) {
          console.warn('ai-day: could not save the brief', renameErr);
        }
      });
    });
  }

  async refresh(now = new Date()) {
    const start = periodStart(now);
    if (this._loading || this._tried === start || this.current(now)) {
      return;
    }
    const pick = pickDay(
      await this._inbox(),
      (id) => TriageStore.entry(id),
      TriageStore.threshold(),
      now.getTime()
    );
    if (!pick) {
      return;
    }
    if (pick.needs.length === 0) {
      this._quiet = true;
      this.trigger();
      return;
    }
    this._tried = start;
    this._loading = true;
    this._quiet = false;
    this.trigger();
    try {
      const text = toBrief(
        await this._post(
          '/api/ai/day',
          {
            today: todayString(now),
            needs: pick.needs.length,
            spam: pick.spam,
            threads: await this._items(pick.needs.slice(0, MAX_THREADS)),
          },
          25000
        )
      );
      if (text) {
        this._brief = { t: now.getTime(), brief: text };
        this._save(this._brief);
      }
    } catch (err) {
      console.warn(`ai-day: no brief, the backend answered ${err.statusCode}`);
    } finally {
      this._loading = false;
      this.trigger();
    }
  }
}

export default new DayStore();
