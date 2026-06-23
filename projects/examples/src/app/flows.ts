import { asStepper, RuntimeStepper, SharedLink, StepperBuilder } from 'ngx-formad';
import {
  cardRefundForm,
  complaintDetailsForm,
  complaintReasonForm,
  conditionForm,
  contactForm,
  ContactModel,
  defectForm,
  deliveryAddressForm,
  orderForm,
  productForm,
  purchaseForm,
  refundForm,
  returnReasonForm,
  returnShippingForm,
  shipmentForm,
  storeCreditForm,
  unboxingForm,
  verifyForm,
} from './forms';

// Each wizard is one fluent chain. The forms come from the shared pool; the
// steps arrange them; and `withState` + `bind` carry values between steps.
//
// The headline of the library shows up in the contact step: its `taxId` is linked
// to the same shared key the order step writes, so the tax id typed at the
// start arrives pre-filled at the end — directional autofill, the "we pre-filled
// this from an earlier step" behaviour. The user can still overwrite it, and once
// they do it is left alone on revisit.

// The cross-step shared state, shared by all three flows' chains (each builds its
// own store; the shape is common because the contact step is common).
const sharedShape = {
  email: '',
  orderNumber: '',
  taxId: '',
  companyName: '',
  street: '',
  zip: '',
  city: '',
  firstName: '',
  lastName: '',
  // The return flow forks on this — chosen on the Refund step, read by the fork.
  refundMethod: '',
};

export function buildReturnFlow(): RuntimeStepper {
  return asStepper(
    new StepperBuilder()
      .withState(sharedShape)
      .createForm('order', orderForm)
      .createForm('verify', verifyForm)
      .createForm('reason', returnReasonForm)
      .createForm('condition', conditionForm)
      .createForm('returnShipping', returnShippingForm)
      .createForm('contact', contactForm)
      .createForm('refund', refundForm)
      .createForm('storeCredit', storeCreditForm)
      .createForm('card', cardRefundForm)
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Your order', subheading: 'Find the order you want to return.' } },
          (page) =>
            page.addForm((f) => f.order, {
              bind: (l) =>
                l
                  .link((m) => m.orderNumber, (s) => s.orderNumber)
                  .link((m) => m.taxId, (s) => s.taxId),
            }),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: "Verify it's you", subheading: 'Enter the code we e-mailed you.' } },
          (page) => page.addForm((f) => f.verify),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Reason for return', subheading: 'Why are you sending it back?' } },
          (page) => page.addForm((f) => f.reason),
        ),
      )
      // Optional: nothing here is required, so the shell offers a Skip.
      .createStep(
        (step) =>
          step.createPage(
            { options: { heading: 'Product condition', subheading: 'Optional — tell us what shape it is in.' } },
            (page) => page.addForm((f) => f.condition),
          ),
        { optional: true },
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Return method', subheading: 'How should it get back to us?' } },
          (page) => page.addForm((f) => f.returnShipping),
        ),
      )
      // Billing has a nested address group; its city/street/zip render as a fieldset.
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Billing details', subheading: 'Where we send the confirmation and label.' } },
          (page) => page.addForm((f) => f.contact, { bind: (l) => contactLinks(l) }),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Refund', subheading: 'Choose how to receive your money back.' } },
          (page) =>
            page.addForm((f) => f.refund, {
              bind: (l) => l.link((m) => m.method, (s) => s.refundMethod),
            }),
        ),
      )
      // Fork: store credit and card refund are different sub-flows with different
      // results — they do not rejoin.
      .fork((ctx) => ctx.shared.refundMethod, {
        'store-credit': (arm) =>
          arm
            .createStep((step) =>
              step.createPage(
                { options: { heading: 'Store credit', subheading: 'Where should the credit code go?' } },
                (page) => page.addForm((f) => f.storeCredit),
              ),
            )
            .result(() => ({ kind: 'store-credit' as const, label: 'Store credit issued' })),
        card: (arm) =>
          arm
            .createStep((step) =>
              step.createPage(
                { options: { heading: 'Card refund', subheading: 'Confirm the card to refund.' } },
                (page) => page.addForm((f) => f.card),
              ),
            )
            .result(() => ({ kind: 'card' as const, label: 'Refund to original card' })),
      })
      .build(),
  );
}

export function buildComplaintFlow(): RuntimeStepper {
  return asStepper(
    new StepperBuilder()
      .withState(sharedShape)
      .createForm('order', orderForm)
      .createForm('verify', verifyForm)
      .createForm('reason', complaintReasonForm)
      .createForm('details', complaintDetailsForm)
      .createForm('unboxing', unboxingForm)
      .createForm('shipment', shipmentForm)
      .createForm('contact', contactForm)
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Your order', subheading: 'Find the order this complaint is about.' } },
          (page) =>
            page.addForm((f) => f.order, {
              bind: (l) =>
                l
                  .link((m) => m.orderNumber, (s) => s.orderNumber)
                  .link((m) => m.taxId, (s) => s.taxId),
            }),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: "Verify it's you", subheading: 'Enter the code we e-mailed you.' } },
          (page) => page.addForm((f) => f.verify),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'What went wrong', subheading: 'Tell us about the problem.' } },
          (page) => page.addForm((f) => f.reason),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Details', subheading: 'A short description and the date.' } },
          (page) => page.addForm((f) => f.details),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Usage', subheading: 'Was the item opened or used?' } },
          (page) => page.addForm((f) => f.unboxing),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Shipping', subheading: 'Carrier and transit-damage details.' } },
          (page) => page.addForm((f) => f.shipment),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Billing details', subheading: 'Where we send the confirmation.' } },
          (page) => page.addForm((f) => f.contact, { bind: (l) => contactLinks(l) }),
        ),
      )
      .build(),
  );
}

export function buildWarrantyFlow(): RuntimeStepper {
  return asStepper(
    new StepperBuilder()
      .withState(sharedShape)
      .createForm('product', productForm)
      .createForm('deliveryAddress', deliveryAddressForm)
      .createForm('purchase', purchaseForm)
      .createForm('defect', defectForm)
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Your product', subheading: 'Identify the product you are claiming.' } },
          (page) => page.addForm((f) => f.product),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Delivery address', subheading: 'Where we should collect or deliver the item.' } },
          (page) =>
            page.addForm((f) => f.deliveryAddress, {
              bind: (l) =>
                l
                  .link((m) => m.street, (s) => s.street)
                  .link((m) => m.zip, (s) => s.zip)
                  .link((m) => m.city, (s) => s.city),
            }),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Where you bought it', subheading: 'Store and contact details (optional).' } },
          (page) =>
            page.addForm((f) => f.purchase, {
              bind: (l) => l.link((m) => m.email, (s) => s.email),
            }),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Describe the issue', subheading: 'What is wrong, and when you noticed.' } },
          (page) => page.addForm((f) => f.defect),
        ),
      )
      .build(),
  );
}

// The contact step links the top-level fields it shares with the rest of the
// wizard — `taxId` most visibly, pre-filled from the order step.
//
// It is shared by both flows, so it is named here rather than inlined twice. The
// call sites wrap it as `bind: (l) => contactLinks(l)` instead of `bind:
// contactLinks`: passing a pre-typed function by reference makes TypeScript stop
// inferring the selected form key `K` from the `(f) => f.contact` selector and
// fall back to the union of every pooled model. The one-line arrow keeps that
// inference, so `l` arrives correctly typed as the contact form's links.
const contactLinks = (l: SharedLink<ContactModel, typeof sharedShape>) =>
  l
    // `taxId` is the visible one — pre-filled from the order step. The company
    // address lives in a nested group now; `bind` addresses top-level keys, so the
    // address fields are simply local to this form (a known follow-up: nested bind).
    .link((m) => m.taxId, (s) => s.taxId)
    .link((m) => m.companyName, (s) => s.companyName)
    .link((m) => m.firstName, (s) => s.firstName)
    .link((m) => m.lastName, (s) => s.lastName)
    .link((m) => m.email, (s) => s.email);
