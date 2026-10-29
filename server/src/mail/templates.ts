// Plain-text mail bodies (P5b). No HTML, no images, no tracking.
export type MailTemplate = 'verify' | 'reset' | 'invite';
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
