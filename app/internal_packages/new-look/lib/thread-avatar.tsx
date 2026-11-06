import React from 'react';
import { Contact, Message, Thread, Utils } from 'mailspring-exports';

type ThreadWithMessages = Thread & { __messages?: Message[] };

// The person on the other side: the sender of the last incoming message, else the first
// other participant, which is the recipient for sent mail.
function otherContact(thread: ThreadWithMessages): Contact | undefined {
  const incoming = (thread.__messages || []).filter((m) => !m.draft && !m.isFromMe());
  const last = incoming[incoming.length - 1];
  if (last && last.from[0]) {
    return last.from[0];
  }
  const participants = thread.participants || [];
  return participants.find((c) => !c.isMe()) || participants[0];
}

/** Initials on a colour from the address, in the narrow thread list row. */
export class ThreadAvatar extends React.Component<{ thread: ThreadWithMessages }> {
  static displayName = 'NewLookThreadAvatar';
  static containerRequired = false;

  render() {
    const contact = otherContact(this.props.thread);
    if (!contact) {
      return false;
    }
    return (
      <span
        className="new-look-avatar"
        aria-hidden="true"
        style={{ backgroundColor: `hsl(${Utils.hueForString(contact.email)}, 50%, 45%)` }}
      >
        {contact.nameAbbreviation()}
      </span>
    );
  }
}
