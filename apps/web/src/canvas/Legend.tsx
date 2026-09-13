import * as Popover from '@radix-ui/react-popover';
import { Icon } from '../components/Icon';

function swatch(label: string, dash?: string) {
  return (
    <li key={label} className="flex items-center gap-3">
      <svg aria-hidden="true" width="44" height="12" className="shrink-0">
        <line x1="2" y1="6" x2="42" y2="6" stroke="var(--kf-edge)" strokeWidth="2.5" strokeDasharray={dash} strokeLinecap="round" />
      </svg>
      {label}
    </li>
  );
}

/** What the marks on the canvas mean. Opens on click or Enter, never hover. */
export function Legend() {
  return (
    <Popover.Root>
      <Popover.Trigger className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold text-ink hover:bg-sunken">
        <Icon name="info" className="size-4" />
        Legend
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Legend"
          className="z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-card border border-line bg-surface p-4 text-base text-ink shadow-card"
        >
          <p className="text-lg font-semibold">What the marks mean</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            <li className="flex items-center gap-3">
              <span className="inline-flex w-11 shrink-0 justify-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">
                  <Icon name="target" className="size-3" />
                </span>
              </span>
              Focus person — relationships are shown relative to them
            </li>
            <li className="flex items-center gap-3">
              <span aria-hidden="true" className="inline-block h-6 w-11 shrink-0 rounded-md border-2 border-line bg-sunken" />
              Deceased (card is shaded, dates show the lifespan)
            </li>
            <li className="flex items-center gap-3">
              <span aria-hidden="true" className="inline-block h-6 w-11 shrink-0 rounded-md border-2 border-dashed border-line-strong" />
              Unnamed placeholder — name them any time
            </li>
            {swatch('Marriage, partnership, or birth parent')}
            {swatch('Divorced or separated; adopted or step link', '8 6')}
            {swatch('Foster or guardian link', '2 5')}
          </ul>
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
