import { ChevronDown } from 'lucide-react';
import type { LeadStatus } from '../lib/api.ts';

const OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new_qualified', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'hot', label: 'Hot' },
  { value: 'cold', label: 'Cold' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

/**
 * Native <select> styled to match the design language. On iOS this opens
 * the native picker (huge thumb-friendly). On desktop it's a clean dropdown.
 */
export default function StatusSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: LeadStatus;
  onChange: (next: LeadStatus) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as LeadStatus)}
        className="block h-12 w-full appearance-none rounded-sm border border-border bg-surface-1 px-3.5 pr-10 text-[15px] font-medium text-ink focus:border-ink focus:outline-none disabled:opacity-60"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
        strokeWidth={2.25}
      />
    </div>
  );
}
