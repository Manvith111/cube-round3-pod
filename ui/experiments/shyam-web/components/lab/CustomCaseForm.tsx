'use client';

import React from 'react';

/** The expected values a user types for their own photos. The backend checks every field again. */
export interface CustomCase {
  name: string;
  sku: string;
  expectedFnsku: string;
  category: string;
  cartons: string;
  units: string;
  orderLines: string;
  parts: string;
  route: 'mfn' | 'fba';
  returned: boolean;
  requiresPolybag: boolean;
  hasExpiry: boolean;
  isFragile: boolean;
  coverOriginalBarcode: boolean;
  handlingMarks: string;
}

export const EMPTY_CUSTOM: CustomCase = {
  name: '',
  sku: '',
  expectedFnsku: '',
  category: '',
  cartons: '1',
  units: '1',
  orderLines: '',
  parts: '',
  route: 'mfn',
  returned: false,
  requiresPolybag: false,
  hasExpiry: false,
  isFragile: false,
  coverOriginalBarcode: false,
  handlingMarks: '',
};

const whole = (v: string) => (/^\d+$/.test(v.trim()) ? parseInt(v.trim(), 10) : NaN);

/** A reason the form cannot be sent yet, or null. */
export function customProblem(c: CustomCase): string | null {
  if (!c.sku.trim()) return 'Enter a SKU for your own case.';
  if (!(whole(c.cartons) >= 1)) return 'Cartons expected must be a whole number, 1 or more.';
  if (!(whole(c.units) >= 1)) return 'Units expected must be a whole number, 1 or more.';
  return null;
}

/** The body the backend expects (snake_case). */
export function customPayload(c: CustomCase) {
  return {
    name: c.name.trim(),
    sku: c.sku.trim(),
    expected_fnsku: c.expectedFnsku.trim(),
    category: c.category.trim(),
    cartons: whole(c.cartons),
    units: whole(c.units),
    order_lines: c.orderLines.trim(),
    parts_list: c.parts.trim(),
    route: c.route,
    returned: c.returned,
    requires_polybag: c.requiresPolybag,
    has_expiry: c.hasExpiry,
    is_fragile: c.isFragile,
    cover_original_barcode: c.coverOriginalBarcode,
    required_handling_marks: c.handlingMarks.trim(),
  };
}

interface Props {
  value: CustomCase;
  onChange: (next: CustomCase) => void;
  disabled?: boolean;
}

const input = 'w-full p-2.5 rounded-2xl neu-input text-xs font-mono font-semibold bg-white normal-case';

function Field({ label, used, children }: { label: string; used: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-[11px] font-bold uppercase tracking-wider text-slate-600">
      <span className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        <span className="text-[10px] font-semibold normal-case tracking-normal text-slate-400">{used}</span>
      </span>
      {children}
    </label>
  );
}

export default function CustomCaseForm({ value: v, onChange, disabled }: Props) {
  const set = <K extends keyof CustomCase>(key: K, val: CustomCase[K]) => onChange({ ...v, [key]: val });
  const flag = (key: 'requiresPolybag' | 'hasExpiry' | 'isFragile' | 'coverOriginalBarcode', label: string) => (
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
      <input type="checkbox" checked={v[key]} disabled={disabled} onChange={(e) => set(key, e.target.checked)} className="w-4 h-4 accent-[#773C30]" />
      {label}
    </label>
  );

  return (
    <fieldset disabled={disabled} className="rounded-[24px] neu-pressed-sm p-5 space-y-4">
      <legend className="sr-only">Your own expected values</legend>
      <p className="text-xs text-slate-600">
        Type what your photos should show. The agents judge your photos against these values instead of the sample data. Add photos for each stage
        you run (step 3).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="SKU *" used="all stages">
          <input value={v.sku} onChange={(e) => set('sku', e.target.value)} placeholder="LAMP-X1" autoComplete="off" spellCheck={false} className={input} />
        </Field>
        <Field label="Product name" used="Receiving, Prep">
          <input value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="LED Desk Lamp" autoComplete="off" className={input} />
        </Field>
        <Field label="Category" used="Prep">
          <input value={v.category} onChange={(e) => set('category', e.target.value)} placeholder="Home & Kitchen" autoComplete="off" className={input} />
        </Field>
        <Field label="Cartons expected" used="Receiving">
          <input value={v.cartons} onChange={(e) => set('cartons', e.target.value)} inputMode="numeric" className={input} />
        </Field>
        <Field label="Units expected (total)" used="Receiving">
          <input value={v.units} onChange={(e) => set('units', e.target.value)} inputMode="numeric" className={input} />
        </Field>
        <Field label="FNSKU label text" used="Prep">
          <input value={v.expectedFnsku} onChange={(e) => set('expectedFnsku', e.target.value)} placeholder="X001ABC123" autoComplete="off" spellCheck={false} className={input} />
        </Field>
        <Field label="Order lines (SKU:qty;SKU:qty)" used="Pack">
          <input value={v.orderLines} onChange={(e) => set('orderLines', e.target.value)} placeholder="LAMP-X1:2;BULB-A:4" autoComplete="off" spellCheck={false} className={input} />
        </Field>
        <Field label="Parts that should be there" used="Returns">
          <input value={v.parts} onChange={(e) => set('parts', e.target.value)} placeholder="lamp;usb cable;manual" autoComplete="off" className={input} />
        </Field>
        <Field label="Required handling marks" used="Prep">
          <input value={v.handlingMarks} onChange={(e) => set('handlingMarks', e.target.value)} placeholder="fragile;this_way_up" autoComplete="off" className={input} />
        </Field>
        <Field label="Route" used="decides Prep or Pack">
          <select value={v.route} onChange={(e) => set('route', e.target.value as 'mfn' | 'fba')} className={input}>
            <option value="mfn">MFN (Pack)</option>
            <option value="fba">FBA (Prep)</option>
          </select>
        </Field>
        <Field label="Has a return?" used="decides Returns">
          <select value={v.returned ? 'yes' : 'no'} onChange={(e) => set('returned', e.target.value === 'yes')} className={input}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 w-full">Prep requirements</span>
        {flag('requiresPolybag', 'Needs a polybag')}
        {flag('hasExpiry', 'Has an expiry date')}
        {flag('isFragile', 'Fragile')}
        {flag('coverOriginalBarcode', 'Original barcode must be covered')}
      </div>
    </fieldset>
  );
}
