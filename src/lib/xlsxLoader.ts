/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

let xlsxModulePromise: Promise<typeof import('xlsx')> | null = null;

/**
 * Lazy-loads SheetJS (xlsx) only when the user exports or imports an Excel file,
 * keeping ~800KB out of the initial startup bundle.
 */
export function loadXlsx(): Promise<typeof import('xlsx')> {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx');
  }
  return xlsxModulePromise;
}
