import { PageHeader, TextLink } from '../components/ui';

export function NotFound() {
  return (
    <div>
      <PageHeader title="Page not found" lead="That page does not exist." />
      <TextLink to="/">Back to the start</TextLink>
    </div>
  );
}
