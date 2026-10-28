import {
  MONTHS,
  TAX_PERIODS,
  entityTypesFor,
  taxLabel,
  withJurisdiction,
  type EntityProfile,
  type Jurisdiction,
} from '../lib/entity';
import { Field, inputClass } from './ui';

export function parseJurisdiction(value: string): Jurisdiction {
  if (value === 'UK') return 'UK';
  if (value === 'AU+UK') return 'AU+UK';
  return 'AU';
}

export function EntityFields({ value, onChange }: { value: EntityProfile; onChange: (next: EntityProfile) => void }) {
  const types = entityTypesFor(value.jurisdiction);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Jurisdiction">
        <select
          className={inputClass}
          value={value.jurisdiction}
          onChange={(e) => onChange(withJurisdiction(value, parseJurisdiction(e.target.value)))}
        >
          <option value="AU">Australia</option>
          <option value="UK">United Kingdom</option>
          <option value="AU+UK">Both</option>
        </select>
      </Field>
      <Field label="Entity type">
        <select
          className={inputClass}
          value={value.entityType}
          onChange={(e) => {
            const hit = types.find((t) => t.value === e.target.value);
            if (hit) onChange({ ...value, entityType: hit.value });
          }}
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={value.taxRegistered}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { ...value, taxRegistered: true, taxPeriod: 'quarterly' }
                : { ...value, taxRegistered: false, taxPeriod: null },
            )
          }
        />
        Registered for {taxLabel(value.jurisdiction)}
      </label>
      {value.taxRegistered && (
        <Field label="Return period">
          <select
            className={inputClass}
            value={value.taxPeriod ?? 'quarterly'}
            onChange={(e) => {
              const hit = TAX_PERIODS.find((p) => p.value === e.target.value);
              if (hit) onChange({ ...value, taxPeriod: hit.value });
            }}
          >
            {TAX_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Financial year ends" hint="Check the entity's actual year end.">
        <select
          className={inputClass}
          value={value.fyEndMonth}
          onChange={(e) => onChange({ ...value, fyEndMonth: Number(e.target.value) })}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
