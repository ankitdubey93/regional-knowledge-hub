import { Outlet } from 'react-router-dom';

/** The sign-in, sign-up and password pages: a butter panel beside one form, stacked on a phone. */
export function AuthShell() {
  return (
    <div className="grid overflow-hidden rounded-[32px] bg-panel shadow-soft lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-sun-soft p-12 lg:flex lg:flex-col lg:justify-between lg:gap-10">
        <span aria-hidden className="pointer-events-none absolute -right-20 -bottom-24 size-80 rounded-full bg-peach-soft" />
        <span aria-hidden className="pointer-events-none absolute right-40 bottom-40 size-32 rounded-full bg-accent-soft" />
        <span aria-hidden className="pointer-events-none absolute bottom-20 left-56 size-16 rounded-full bg-uk-soft" />
        <p className="relative font-display text-[40px] leading-[48px] font-semibold tracking-tight text-balance">
          Your clients, their deadlines and the rules, in one place.
        </p>
        <p className="relative max-w-sm text-[17px] leading-7">For bookkeepers and firms in Australia and the UK.</p>
      </aside>
      <div className="min-w-0 p-6 sm:p-12">
        <Outlet />
      </div>
    </div>
  );
}
