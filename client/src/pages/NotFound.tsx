import { PageHeader, TextLink } from '../components/ui';

export function NotFound() {
  return (
    <div className="relative overflow-hidden rounded-[32px] bg-peach-soft px-6 py-14 sm:px-14 sm:py-20">
      <span aria-hidden className="pointer-events-none absolute -right-12 -bottom-16 size-56 rounded-full bg-sun-soft" />
      <div className="relative">
        <PageHeader title="Page not found" lead="That page does not exist." />
        <TextLink to="/">Back to the start</TextLink>
      </div>
    </div>
  );
}
