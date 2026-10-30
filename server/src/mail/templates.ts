// Plain-text mail bodies (P5b). No HTML, no images, no tracking.
export type MailTemplate = 'verify' | 'reset' | 'invite' | 'request_link' | 'request_nudge';
export type MailContent = { subject: string; text: string; template: MailTemplate };

export function verifyEmail(url: string): MailContent {
  return {
    template: 'verify',
    subject: 'Confirm your email for Compliance Hub',
    text: `Confirm your email address by opening this link:\n\n${url}\n\nIf you did not sign up, ignore this email.`,
  };
}

export function resetPassword(url: string): MailContent {
  return {
    template: 'reset',
    subject: 'Reset your Compliance Hub password',
    text: `Someone asked to reset the password for this email address. To choose a new password, open this link within the next hour:\n\n${url}\n\nIf it was not you, ignore this email; your password has not changed.`,
  };
}

export function invitation(workspaceName: string, inviterName: string, url: string): MailContent {
  return {
    template: 'invite',
    subject: `${inviterName} invited you to ${workspaceName} on Compliance Hub`,
    text: `${inviterName} invited you to join ${workspaceName} on Compliance Hub.\n\nTo accept, open this link and sign in or create an account with this email address:\n\n${url}\n\nIf you were not expecting this, ignore this email.`,
  };
}

// C3. Names the firm only: never item labels, amounts or the client's name. expiresOn is already formatted ("29 November 2026").
export function requestLinkMail(firmName: string, url: string, expiresOn: string): MailContent {
  return {
    template: 'request_link',
    subject: `${firmName} has asked you for documents`,
    text: `${firmName} has asked you to upload some documents through Compliance Hub.\n\nOpen this link to see what is needed and upload the files. You do not need an account.\n\n${url}\n\nThe link works until ${expiresOn}.\n\nIf you were not expecting this, ignore this email.`,
  };
}

export function requestNudgeMail(firmName: string, url: string, expiresOn: string): MailContent {
  return {
    template: 'request_nudge',
    subject: `Reminder: ${firmName} is waiting for documents`,
    text: `${firmName} is still waiting for some documents.\n\nOpen this link to see what is still needed and upload the files:\n\n${url}\n\nThe link works until ${expiresOn}.\n\nIf you have already sent everything, ignore this email.`,
  };
}
