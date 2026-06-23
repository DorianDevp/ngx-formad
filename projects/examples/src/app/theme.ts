// The three self-service flows of a generic online store. Names and colours
// only — no real brand, company, or domain appears anywhere. The store is just
// "COMPANY". Each flow owns an accent the chrome reads through CSS variables.
export type FlowKey = 'return' | 'complaint' | 'failure';

export interface FlowTheme {
  readonly key: FlowKey;
  /** Badge text shown in the progress bar. */
  readonly label: string;
  readonly accent: string;
  readonly accentDark: string;
  readonly accentLight: string;
  readonly icon: string;
  /** Confirmation ticket prefix, e.g. RET-2024-0001. */
  readonly ticket: string;
  readonly doneTitle: string;
  readonly successText: string;
}

export const THEMES: Record<FlowKey, FlowTheme> = {
  return: {
    key: 'return',
    label: 'Return',
    accent: '#059669',
    accentDark: '#047857',
    accentLight: '#ecfdf5',
    icon: 'ti-package-export',
    ticket: 'RET-2024-0001',
    doneTitle: 'Return request received',
    successText: 'Your return is being reviewed by our team. A prepaid label will follow by email.',
  },
  complaint: {
    key: 'complaint',
    label: 'Complaint',
    accent: '#4f46e5',
    accentDark: '#4338ca',
    accentLight: '#eef2ff',
    icon: 'ti-shield-exclamation',
    ticket: 'CLM-2024-0001',
    doneTitle: 'Complaint submitted',
    successText: 'Thanks — your claim is in review. We will reach out within two business days.',
  },
  failure: {
    key: 'failure',
    label: 'Warranty',
    accent: '#d97706',
    accentDark: '#b45309',
    accentLight: '#fffbeb',
    icon: 'ti-certificate',
    ticket: 'WTY-2024-0001',
    doneTitle: 'Warranty claim registered',
    successText: 'Your product is registered and the claim is in review. We will email the next steps.',
  },
};
