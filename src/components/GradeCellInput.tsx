/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';

interface GradeCellInputProps {
  value: number | null | undefined;
  max?: number;
  className?: string;
  placeholder?: string;
  onChangeScore: (score: number | null) => void;
}

function normalizeNumericInput(raw: string): string {
  const converted = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[٫,]/g, '.')
    .replace(/\s+/g, '');

  // Keep only digits and at most one decimal dot
  let result = '';
  let hasDot = false;
  for (const ch of converted) {
    if (ch >= '0' && ch <= '9') {
      result += ch;
    } else if (ch === '.' && !hasDot) {
      hasDot = true;
      result += ch;
    }
  }
  return result;
}

export const GradeCellInput: React.FC<GradeCellInputProps> = ({
  value,
  max,
  className = '',
  placeholder = '---',
  onChangeScore
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const justFocusedRef = useRef(false);

  const externalValueStr =
    value !== null && value !== undefined && !Number.isNaN(value) ? String(value) : '';
  const displayValue = draft !== null ? draft : externalValueStr;

  const selectAllText = (el: HTMLInputElement) => {
    const applySelect = () => {
      try {
        el.select();
        el.setSelectionRange(0, el.value.length);
      } catch {}
    };
    applySelect();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(applySelect);
    }
    setTimeout(applySelect, 0);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      dir="ltr"
      value={displayValue}
      placeholder={placeholder}
      className={className}
      onFocus={(e) => {
        justFocusedRef.current = true;
        setDraft(externalValueStr);
        selectAllText(e.currentTarget);
      }}
      onClick={(e) => {
        if (justFocusedRef.current) {
          justFocusedRef.current = false;
          selectAllText(e.currentTarget);
        }
      }}
      onChange={(e) => {
        justFocusedRef.current = false;
        const normalized = normalizeNumericInput(e.target.value);
        if (normalized === '') {
          setDraft('');
          onChangeScore(null);
          return;
        }

        if (normalized === '.') {
          setDraft('0.');
          return;
        }

        const parsed = parseFloat(normalized);
        if (Number.isNaN(parsed)) {
          setDraft(normalized);
          return;
        }

        let clamped = parsed;
        if (clamped < 0) clamped = 0;
        if (max !== undefined && clamped > max) {
          clamped = max;
          setDraft(String(max));
        } else {
          setDraft(normalized);
        }

        onChangeScore(clamped);
      }}
      onBlur={() => {
        justFocusedRef.current = false;
        setDraft(null);
      }}
    />
  );
};

export default GradeCellInput;
