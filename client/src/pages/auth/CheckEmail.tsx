import { PageHeader, TextLink } from '../../components/ui';

export function CheckEmail() {
  return (
    <div className="space-y-6">
      <PageHeader title="Check your email" lead="We sent a link to confirm your address. Open it to finish signing up." />
      <p className="text-sm text-muted">No mail? Check your spam folder, or sign in again to get a new link.</p>
      <TextLink to="/sign-in">Sign in</TextLink>
    </div>
  );
}
