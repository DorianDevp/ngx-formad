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
// The forms are declared once and reused across flows; the order and contact
// forms appear in more than one wizard, which is why shared state (flows.ts)
// carries values between them.

// Reused patterns, named so the messages and the regex stay in one place.
const ORDER = /^[A-Za-z]{2,4}-\d{4,8}$/;
const TAX_ID = /^\d{10}$/;
const CODE = /^\d{6}$/;
const ZIP = /^\d{5}$/;
const PHONE = /^[+]?[\d ()-]{7,}$/;

/** Step 1 of return/complaint: which order the case concerns. */
export type OrderModel = { orderNumber: string; taxId: string };
export const orderForm: FormConfig<OrderModel> = {
  model: () => ({ orderNumber: '', taxId: '' }),
  ui: UiFormConfigBuilder.from({ orderNumber: '', taxId: '' })
    .orderNumber(text('Order number', { placeholder: 'e.g. ORD-100423' }))
    .taxId(text('Tax ID (VAT)', { placeholder: 'e.g. 1234567890' })),
  schema: (p) => {
    required(p.orderNumber, { message: 'Enter the order number from your confirmation email.' });
    pattern(p.orderNumber, ORDER, { message: 'Use the format ORD-100423.' });
    required(p.taxId, { message: 'A tax ID is required for business orders.' });
    pattern(p.taxId, TAX_ID, { message: 'Tax ID must be exactly 10 digits.' });
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
  opened: boolean;
  used: boolean;
  originalPackaging: boolean;
  complete: boolean;
};
export const conditionForm: FormConfig<ConditionModel> = {
  model: () => ({ opened: false, used: false, originalPackaging: false, complete: false }),
  ui: UiFormConfigBuilder.from({
    opened: false,
    used: false,
    originalPackaging: false,
    complete: false,
  })
    .opened(checkbox('It was opened'))
    .used(checkbox('It was used'))
    .originalPackaging(checkbox('In original packaging'))
    .complete(checkbox('All parts included')),
};

/** How the goods get back to us. */
export type ReturnShippingModel = { method: string };
export const returnShippingForm: FormConfig<ReturnShippingModel> = {
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
export type ComplaintDetailsModel = { noticedOn: string; description: string };
export const complaintDetailsForm: FormConfig<ComplaintDetailsModel> = {
  model: () => ({ noticedOn: '', description: '' }),
  ui: UiFormConfigBuilder.from({ noticedOn: '', description: '' })
    .noticedOn(text('Date you noticed it', { placeholder: 'YYYY-MM-DD' }))
    .description(textarea('Describe the problem', { placeholder: 'What happened, and when?' })),
  schema: (p) => {
    required(p.description, { message: 'A short description helps us route the claim.' });
    minLength(p.description, 20, { message: 'Please add a little more detail (20+ characters).' });
  },
};

/** Usage context for a complaint. */
export type UnboxingModel = { wasOpened: string; noticedWhen: string };
export const unboxingForm: FormConfig<UnboxingModel> = {
  model: () => ({ wasOpened: '', noticedWhen: '' }),
  ui: UiFormConfigBuilder.from({ wasOpened: '', noticedWhen: '' })
    .wasOpened(
      select('Has the item been opened or used?', [
        { value: 'yes', description: 'Yes' },
        { value: 'no', description: 'No' },
      ]),
    )
    .noticedWhen(
      select('When did you notice the issue?', [
        { value: 'before', description: 'Before opening it' },
        { value: 'after', description: 'After using it' },
        { value: 'na', description: 'Not sure' },
      ]),
    ),
  schema: (p) => required(p.wasOpened, { message: 'Let us know if it was used.' }),
};

/** Carrier / transit-damage details for a complaint. */
export type ShipmentModel = { reportedToCarrier: string; carrier: string; claimNumber: string };
export const shipmentForm: FormConfig<ShipmentModel> = {
  model: () => ({ reportedToCarrier: '', carrier: '', claimNumber: '' }),
  ui: UiFormConfigBuilder.from({ reportedToCarrier: '', carrier: '', claimNumber: '' })
    .reportedToCarrier(
      select('Reported to the carrier?', [
        { value: 'yes', description: 'Yes' },
        { value: 'no', description: 'No' },
        { value: 'na', description: 'Not applicable' },
      ]),
    )
    .carrier(text('Carrier', { placeholder: 'e.g. Carrier A' }))
    .claimNumber(text('Damage report number', { placeholder: 'e.g. DR-2024-0001' })),
};

/** Company + person data — the final step of return and complaint. */
export type ContactModel = {
  taxId: string;
  companyName: string;
  street: string;
  zip: string;
  city: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};
export const contactForm: FormConfig<ContactModel> = {
  model: () => ({
    taxId: '',
    companyName: '',
    street: '',
    zip: '',
    city: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  }),
  ui: UiFormConfigBuilder.from({
    taxId: '',
    companyName: '',
    street: '',
    zip: '',
    city: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  })
    .taxId(text('Tax ID (VAT)'))
    .companyName(text('Company name'))
    .street(text('Street and number'))
    .zip(text('ZIP code', { placeholder: '12345' }))
    .city(text('City'))
    .firstName(text('First name'))
    .lastName(text('Last name'))
    .email(emailField('E-mail'))
    .phone(phoneField('Phone (optional)')),
  schema: (p) => {
    required(p.companyName, { message: 'Company name is required for the invoice.' });
    pattern(p.taxId, TAX_ID, { message: 'Tax ID must be exactly 10 digits.' });
    required(p.street, { message: 'We need a street address for the pickup.' });
    required(p.zip, { message: 'ZIP code is required.' });
    pattern(p.zip, ZIP, { message: 'Enter a 5-digit ZIP code.' });
    required(p.city, { message: 'City is required.' });
    required(p.firstName, { message: 'First name is required.' });
    required(p.lastName, { message: 'Last name is required.' });
    required(p.email, { message: 'We send the confirmation here.' });
    email(p.email, { message: 'That does not look like a valid e-mail.' });
    pattern(p.phone, PHONE, { message: 'Use digits, spaces, +, ( ) or -.' });
  },
};

/* ── Warranty-flow forms ── */

/** The product a warranty claim concerns. */
export type ProductModel = { brand: string; sku: string; model: string };
export const productForm: FormConfig<ProductModel> = {
  model: () => ({ brand: '', sku: '', model: '' }),
  ui: UiFormConfigBuilder.from({ brand: '', sku: '', model: '' })
    .brand(
      select('Brand', [
        { value: 'a', description: 'Brand A' },
        { value: 'b', description: 'Brand B' },
        { value: 'c', description: 'Brand C' },
        { value: 'other', description: 'Other' },
      ]),
    )
    .sku(text('SKU', { placeholder: 'On the product page and your invoice' }))
    .model(text('Model', { placeholder: 'e.g. Model 450' })),
  schema: (p) => {
    required(p.brand, { message: 'Pick the brand of your product.' });
    required(p.sku, { message: 'The SKU is on the product page and your invoice.' });
    minLength(p.sku, 4, { message: 'A SKU is at least 4 characters.' });
  },
};

/** Where the product is used / delivered. */
export type DeliveryAddressModel = {
  addressLabel: string;
  street: string;
  zip: string;
  city: string;
  region: string;
};
export const deliveryAddressForm: FormConfig<DeliveryAddressModel> = {
  model: () => ({ addressLabel: '', street: '', zip: '', city: '', region: '' }),
  ui: UiFormConfigBuilder.from({
    addressLabel: '',
    street: '',
    zip: '',
    city: '',
    region: '',
  })
    .addressLabel(text('Label', { placeholder: 'e.g. Home, Office' }))
    .street(text('Street and number'))
    .zip(text('ZIP code', { placeholder: '12345' }))
    .city(text('City'))
    .region(
      select('Region', [
        { value: 'n', description: 'North' },
        { value: 's', description: 'South' },
        { value: 'e', description: 'East' },
        { value: 'w', description: 'West' },
      ]),
    ),
  schema: (p) => {
    required(p.addressLabel, { message: 'Give this address a short label.' });
    required(p.street, { message: 'A street address is required.' });
    required(p.zip, { message: 'ZIP code is required.' });
    pattern(p.zip, ZIP, { message: 'Enter a 5-digit ZIP code.' });
    required(p.city, { message: 'City is required.' });
  },
};

/** Where the product was bought. */
export type PurchaseModel = {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
};
export const purchaseForm: FormConfig<PurchaseModel> = {
  model: () => ({ companyName: '', contactName: '', phone: '', email: '' }),
  ui: UiFormConfigBuilder.from({ companyName: '', contactName: '', phone: '', email: '' })
    .companyName(text('Store or retailer'))
    .contactName(text('Contact person'))
    .phone(phoneField('Phone'))
    .email(emailField('E-mail')),
  schema: (p) => {
    email(p.email, { message: 'That does not look like a valid e-mail.' });
    pattern(p.phone, PHONE, { message: 'Use digits, spaces, +, ( ) or -.' });
  },
};

/** The defect description itself. */
export type DefectModel = { noticedOn: string; description: string; errorCode: string };
export const defectForm: FormConfig<DefectModel> = {
  model: () => ({ noticedOn: '', description: '', errorCode: '' }),
  ui: UiFormConfigBuilder.from({ noticedOn: '', description: '', errorCode: '' })
    .noticedOn(text('Date you noticed it', { placeholder: 'YYYY-MM-DD' }))
    .description(textarea('What is wrong?', { placeholder: 'Describe the defect…' }))
    .errorCode(textarea('Error code (if any)', { placeholder: 'Any code shown on the product…' })),
  schema: (p) => {
    required(p.description, { message: 'Describe the defect so we can help.' });
    minLength(p.description, 20, { message: 'Please add a little more detail (20+ characters).' });
  },
};
