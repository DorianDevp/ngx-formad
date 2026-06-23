import { email, minLength, pattern, required } from '@angular/forms/signals';
import {
  UiFormConfigBuilder,
  checkbox,
  email as emailField,
  phone as phoneField,
  select,
  text,
  textarea,
} from 'formodel';
import { FormConfig } from 'ngx-formad';

// Each step of every flow is one of these plain `FormConfig`s. formodel types the
// fields against the model; ngx-formad renders them; the optional `schema` owns
// validation natively (Angular signal forms). The schemas here are deliberately
// varied — required, pattern, min-length, e-mail, and one conditional rule — so
// the example doubles as a validation showcase: every message below is what the
// user sees inline under the field and in the step's error summary.
//
// The forms are declared once and reused across flows; the document and contact
// forms appear in more than one wizard, which is why shared state (flows.ts)
// carries values between them.

// Reused patterns, named so the messages and the regex stay in one place.
const ORDER = /^[A-Za-z]{2,4}-\d{4,8}$/;
const TAX_ID = /^\d{10}$/;
const CODE = /^\d{6}$/;
const ZIP = /^\d{5}$/;
const PHONE = /^[+]?[\d ()-]{7,}$/;

/** Step 1 of return/complaint: which order the case concerns. */
export type DocumentModel = { documentNumber: string; nip: string };
export const documentForm: FormConfig<DocumentModel> = {
  model: () => ({ documentNumber: '', nip: '' }),
  ui: UiFormConfigBuilder.from({ documentNumber: '', nip: '' })
    .documentNumber(text('Order number', { placeholder: 'e.g. ORD-100423' }))
    .nip(text('Tax ID (VAT)', { placeholder: 'e.g. 1234567890' })),
  schema: (p) => {
    required(p.documentNumber, { message: 'Enter the order number from your confirmation email.' });
    pattern(p.documentNumber, ORDER, { message: 'Use the format ORD-100423.' });
    required(p.nip, { message: 'A tax ID is required for business orders.' });
    pattern(p.nip, TAX_ID, { message: 'Tax ID must be exactly 10 digits.' });
  },
};

/** E-mail one-time code, standing in for the prototype's OTP grid. */
export type VerifyModel = { code: string };
export const verifyForm: FormConfig<VerifyModel> = {
  model: () => ({ code: '' }),
  ui: UiFormConfigBuilder.from({ code: '' }).code(
    text('Verification code', { placeholder: '6-digit code from the e-mail' }),
  ),
  schema: (p) => {
    required(p.code, { message: 'Enter the code we e-mailed you.' });
    pattern(p.code, CODE, { message: 'The code is 6 digits.' });
  },
};

/** Why the goods are being returned. */
export type ReturnReasonModel = { reason: string; note: string };
export const returnReasonForm: FormConfig<ReturnReasonModel> = {
  model: () => ({ reason: '', note: '' }),
  ui: UiFormConfigBuilder.from({ reason: '', note: '' })
    .reason(
      select('Reason for return', [
        { value: 'too-many', description: 'Ordered too many' },
        { value: 'mismatch', description: 'Not the right fit for the project' },
        { value: 'changed-mind', description: 'Changed my mind' },
        { value: 'order-mistake', description: 'Ordering mistake' },
        { value: 'other', description: 'Other reason' },
      ]),
    )
    .note(textarea('Tell us more', { placeholder: 'Optional — unless you pick “Other”.' })),
  schema: (p) => {
    required(p.reason, { message: 'Pick the reason that fits best.' });
    // Conditional rule: the note is only required when the reason is "Other".
    required(p.note, {
      when: ({ valueOf }) => valueOf(p.reason) === 'other',
      message: 'Please describe the reason.',
    });
  },
};

/** Condition of the returned goods. */
export type ConditionModel = {
  mounted: boolean;
  used: boolean;
  originalPackaging: boolean;
  complete: boolean;
};
export const conditionForm: FormConfig<ConditionModel> = {
  model: () => ({ mounted: false, used: false, originalPackaging: false, complete: false }),
  ui: UiFormConfigBuilder.from({
    mounted: false,
    used: false,
    originalPackaging: false,
    complete: false,
  })
    .mounted(checkbox('It was installed'))
    .used(checkbox('It was used'))
    .originalPackaging(checkbox('In original packaging'))
    .complete(checkbox('All parts included')),
};

/** How the goods get back to us. */
export type LogisticsModel = { method: string };
export const logisticsForm: FormConfig<LogisticsModel> = {
  model: () => ({ method: '' }),
  ui: UiFormConfigBuilder.from({ method: '' }).method(
    select('Return method', [
      { value: 'self', description: 'I will ship it myself' },
      { value: 'pickup', description: 'Arrange a courier pickup' },
      { value: 'support', description: 'Contact me to arrange it' },
    ]),
  ),
  schema: (p) => required(p.method, { message: 'Choose how you will send the item back.' }),
};

/** Reason + preferred resolution for a complaint. */
export type ComplaintReasonModel = { reason: string; resolution: string };
export const complaintReasonForm: FormConfig<ComplaintReasonModel> = {
  model: () => ({ reason: '', resolution: '' }),
  ui: UiFormConfigBuilder.from({ reason: '', resolution: '' })
    .reason(
      select('What went wrong?', [
        { value: 'incomplete', description: 'Items missing from the order' },
        { value: 'damaged', description: 'Damaged in transit' },
        { value: 'wrong', description: 'Wrong item delivered' },
        { value: 'quality', description: 'Quality not as expected' },
        { value: 'specs', description: 'Specs differ from the listing' },
      ]),
    )
    .resolution(
      select('Preferred resolution', [
        { value: 'replace', description: 'Replacement' },
        { value: 'complete', description: 'Send the missing items' },
        { value: 'correct', description: 'Correct the invoice' },
        { value: 'repair', description: 'Repair' },
        { value: 'refund', description: 'Refund' },
      ]),
    ),
  schema: (p) => {
    required(p.reason, { message: 'Tell us what went wrong.' });
    required(p.resolution, { message: 'Pick how you would like this resolved.' });
  },
};

/** Free-text description of a complaint. */
export type ComplaintDetailsModel = { defectDate: string; description: string };
export const complaintDetailsForm: FormConfig<ComplaintDetailsModel> = {
  model: () => ({ defectDate: '', description: '' }),
  ui: UiFormConfigBuilder.from({ defectDate: '', description: '' })
    .defectDate(text('Date you noticed it', { placeholder: 'YYYY-MM-DD' }))
    .description(textarea('Describe the problem', { placeholder: 'What happened, and when?' })),
  schema: (p) => {
    required(p.description, { message: 'A short description helps us route the claim.' });
    minLength(p.description, 20, { message: 'Please add a little more detail (20+ characters).' });
  },
};

/** Usage context for a complaint. */
export type InstallModel = { wasInstalled: string; problemWhen: string };
export const installForm: FormConfig<InstallModel> = {
  model: () => ({ wasInstalled: '', problemWhen: '' }),
  ui: UiFormConfigBuilder.from({ wasInstalled: '', problemWhen: '' })
    .wasInstalled(
      select('Has the item been opened or used?', [
        { value: 'yes', description: 'Yes' },
        { value: 'no', description: 'No' },
      ]),
    )
    .problemWhen(
      select('When did you notice the issue?', [
        { value: 'before', description: 'Before opening it' },
        { value: 'after', description: 'After using it' },
        { value: 'na', description: 'Not sure' },
      ]),
    ),
  schema: (p) => required(p.wasInstalled, { message: 'Let us know if it was used.' }),
};

/** Carrier / transit-damage details for a complaint. */
export type TransportModel = { reportedToCarrier: string; carrier: string; protocolNumber: string };
export const transportForm: FormConfig<TransportModel> = {
  model: () => ({ reportedToCarrier: '', carrier: '', protocolNumber: '' }),
  ui: UiFormConfigBuilder.from({ reportedToCarrier: '', carrier: '', protocolNumber: '' })
    .reportedToCarrier(
      select('Reported to the carrier?', [
        { value: 'yes', description: 'Yes' },
        { value: 'no', description: 'No' },
        { value: 'na', description: 'Not applicable' },
      ]),
    )
    .carrier(text('Carrier', { placeholder: 'e.g. Carrier A' }))
    .protocolNumber(text('Damage report number', { placeholder: 'e.g. DR-2024-0001' })),
};

/** Company + person data — the final shared step of return and complaint. The
 *  address is a **nested group**, so it renders as its own fieldset and validates
 *  by nested path (`address.city`). */
export type ContactModel = {
  nip: string;
  companyName: string;
  address: { street: string; zip: string; city: string };
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};
const contactInit = {
  nip: '',
  companyName: '',
  address: { street: '', zip: '', city: '' },
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
};
export const contactForm: FormConfig<ContactModel> = {
  model: () => structuredClone(contactInit),
  ui: UiFormConfigBuilder.from(contactInit)
    .nip(text('Tax ID (VAT)'))
    .companyName(text('Company name'))
    .address({ label: 'Company address', maxCols: 2 }, (b) =>
      b
        .street(text('Street and number'))
        .zip(text('ZIP code', { placeholder: '12345' }))
        .city(text('City')),
    )
    .firstName(text('First name'))
    .lastName(text('Last name'))
    .email(emailField('E-mail'))
    .phone(phoneField('Phone (optional)')),
  schema: (p) => {
    required(p.companyName, { message: 'Company name is required for the invoice.' });
    pattern(p.nip, TAX_ID, { message: 'Tax ID must be exactly 10 digits.' });
    required(p.address.street, { message: 'We need a street address for the pickup.' });
    required(p.address.zip, { message: 'ZIP code is required.' });
    pattern(p.address.zip, ZIP, { message: 'Enter a 5-digit ZIP code.' });
    required(p.address.city, { message: 'City is required.' });
    required(p.firstName, { message: 'First name is required.' });
    required(p.lastName, { message: 'Last name is required.' });
    required(p.email, { message: 'We send the confirmation here.' });
    email(p.email, { message: 'That does not look like a valid e-mail.' });
    pattern(p.phone, PHONE, { message: 'Use digits, spaces, +, ( ) or -.' });
  },
};

/* ── Return fork: how the refund is issued ── */

/** Chooses the refund channel — the value the return flow forks on. */
export type RefundModel = { method: string };
export const refundForm: FormConfig<RefundModel> = {
  model: () => ({ method: '' }),
  ui: UiFormConfigBuilder.from({ method: '' }).method(
    select('How should we refund you?', [
      { value: 'store-credit', description: 'Store credit (instant)' },
      { value: 'card', description: 'Back to the original card' },
    ]),
  ),
  schema: (p) => required(p.method, { message: 'Pick how you would like the refund.' }),
};

/** Store-credit arm: where to send the credit code. */
export type StoreCreditModel = { creditEmail: string };
export const storeCreditForm: FormConfig<StoreCreditModel> = {
  model: () => ({ creditEmail: '' }),
  ui: UiFormConfigBuilder.from({ creditEmail: '' }).creditEmail(
    emailField('E-mail for the store-credit code'),
  ),
  schema: (p) => {
    required(p.creditEmail, { message: 'We send the credit code here.' });
    email(p.creditEmail, { message: 'That does not look like a valid e-mail.' });
  },
};

/** Card arm: the last four digits to match the original payment. */
export type CardRefundModel = { last4: string };
export const cardRefundForm: FormConfig<CardRefundModel> = {
  model: () => ({ last4: '' }),
  ui: UiFormConfigBuilder.from({ last4: '' }).last4(
    text('Last 4 digits of the card', { placeholder: '4242' }),
  ),
  schema: (p) => {
    required(p.last4, { message: 'Enter the last four digits.' });
    pattern(p.last4, /^\d{4}$/, { message: 'Exactly four digits.' });
  },
};

/* ── Warranty-flow forms ── */

/** The product a warranty claim concerns. */
export type DeviceModel = { producer: string; serial: string; model: string };
export const deviceForm: FormConfig<DeviceModel> = {
  model: () => ({ producer: '', serial: '', model: '' }),
  ui: UiFormConfigBuilder.from({ producer: '', serial: '', model: '' })
    .producer(
      select('Brand', [
        { value: 'a', description: 'Brand A' },
        { value: 'b', description: 'Brand B' },
        { value: 'c', description: 'Brand C' },
        { value: 'other', description: 'Other' },
      ]),
    )
    .serial(text('Serial number', { placeholder: 'On the box or the product label' }))
    .model(text('Model', { placeholder: 'e.g. Model 450' })),
  schema: (p) => {
    required(p.producer, { message: 'Pick the brand of your product.' });
    required(p.serial, { message: 'The serial number is on the label or your invoice.' });
    minLength(p.serial, 4, { message: 'Serial numbers are at least 4 characters.' });
  },
};

/** Where the product is used / delivered. */
export type ObjectModel = {
  objectName: string;
  street: string;
  zip: string;
  city: string;
  voivodeship: string;
};
export const objectForm: FormConfig<ObjectModel> = {
  model: () => ({ objectName: '', street: '', zip: '', city: '', voivodeship: '' }),
  ui: UiFormConfigBuilder.from({
    objectName: '',
    street: '',
    zip: '',
    city: '',
    voivodeship: '',
  })
    .objectName(text('Label', { placeholder: 'e.g. Home, Office' }))
    .street(text('Street and number'))
    .zip(text('ZIP code', { placeholder: '12345' }))
    .city(text('City'))
    .voivodeship(
      select('Region', [
        { value: 'n', description: 'North' },
        { value: 's', description: 'South' },
        { value: 'e', description: 'East' },
        { value: 'w', description: 'West' },
      ]),
    ),
  schema: (p) => {
    required(p.objectName, { message: 'Give this address a short label.' });
    required(p.street, { message: 'A street address is required.' });
    required(p.zip, { message: 'ZIP code is required.' });
    pattern(p.zip, ZIP, { message: 'Enter a 5-digit ZIP code.' });
    required(p.city, { message: 'City is required.' });
  },
};

/** Where the product was bought. */
export type InstallerModel = {
  companyName: string;
  installerName: string;
  phone: string;
  email: string;
};
export const installerForm: FormConfig<InstallerModel> = {
  model: () => ({ companyName: '', installerName: '', phone: '', email: '' }),
  ui: UiFormConfigBuilder.from({ companyName: '', installerName: '', phone: '', email: '' })
    .companyName(text('Store or retailer'))
    .installerName(text('Contact person'))
    .phone(phoneField('Phone'))
    .email(emailField('E-mail')),
  schema: (p) => {
    email(p.email, { message: 'That does not look like a valid e-mail.' });
    pattern(p.phone, PHONE, { message: 'Use digits, spaces, +, ( ) or -.' });
  },
};

/** The defect description itself. */
export type FaultModel = { defectDate: string; description: string; alarmCodes: string };
export const faultForm: FormConfig<FaultModel> = {
  model: () => ({ defectDate: '', description: '', alarmCodes: '' }),
  ui: UiFormConfigBuilder.from({ defectDate: '', description: '', alarmCodes: '' })
    .defectDate(text('Date you noticed it', { placeholder: 'YYYY-MM-DD' }))
    .description(textarea('What is wrong?', { placeholder: 'Describe the fault…' }))
    .alarmCodes(textarea('Error code (if any)', { placeholder: 'Any code shown on the product…' })),
  schema: (p) => {
    required(p.description, { message: 'Describe the fault so we can help.' });
    minLength(p.description, 20, { message: 'Please add a little more detail (20+ characters).' });
  },
};
