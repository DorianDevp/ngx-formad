import { asStepper, RuntimeStepper, SharedLink, StepperBuilder } from 'ngx-formad';
import {
  complaintDetailsForm,
  complaintReasonForm,
  conditionForm,
  contactForm,
  ContactModel,
  deviceForm,
  documentForm,
  faultForm,
  installForm,
  installerForm,
  logisticsForm,
  objectForm,
  returnReasonForm,
  transportForm,
  verifyForm,
} from './forms';

// Each wizard is one fluent chain. The forms come from the shared pool; the
// steps arrange them; and `withState` + `bind` carry values between steps.
//
// The headline of the library shows up in the contact step: its `nip` is linked
// to the same shared key the document step writes, so the tax id typed at the
// start arrives pre-filled at the end — directional autofill, the "we pre-filled
// this from an earlier step" behaviour. The user can still overwrite it, and once
// they do it is left alone on revisit.

// The cross-step shared state, shared by all three flows' chains (each builds its
// own store; the shape is common because the contact step is common).
const sharedShape = {
  email: '',
  documentNumber: '',
  nip: '',
  companyName: '',
  street: '',
  zip: '',
  city: '',
  firstName: '',
  lastName: '',
};

export function buildReturnFlow(): RuntimeStepper {
  return asStepper(
    new StepperBuilder()
      .withState(sharedShape)
      .createForm('document', documentForm)
      .createForm('verify', verifyForm)
      .createForm('reason', returnReasonForm)
      .createForm('condition', conditionForm)
      .createForm('logistics', logisticsForm)
      .createForm('contact', contactForm)
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Your order', subheading: 'Find the order you want to return.' } },
          (page) =>
            page.addForm((f) => f.document, {
              bind: (l) =>
                l
                  .link((m) => m.documentNumber, (s) => s.documentNumber)
                  .link((m) => m.nip, (s) => s.nip),
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
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Product condition', subheading: 'Tell us what shape it is in.' } },
          (page) => page.addForm((f) => f.condition),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Return method', subheading: 'How should it get back to us?' } },
          (page) => page.addForm((f) => f.logistics),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Billing details', subheading: 'Where we send the confirmation and label.' } },
          (page) => page.addForm((f) => f.contact, { bind: (l) => contactLinks(l) }),
        ),
      )
      .build(),
  );
}

export function buildComplaintFlow(): RuntimeStepper {
  return asStepper(
    new StepperBuilder()
      .withState(sharedShape)
      .createForm('document', documentForm)
      .createForm('verify', verifyForm)
      .createForm('reason', complaintReasonForm)
      .createForm('details', complaintDetailsForm)
      .createForm('install', installForm)
      .createForm('transport', transportForm)
      .createForm('contact', contactForm)
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Your order', subheading: 'Find the order this complaint is about.' } },
          (page) =>
            page.addForm((f) => f.document, {
              bind: (l) =>
                l
                  .link((m) => m.documentNumber, (s) => s.documentNumber)
                  .link((m) => m.nip, (s) => s.nip),
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
          (page) => page.addForm((f) => f.install),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Shipping', subheading: 'Carrier and transit-damage details.' } },
          (page) => page.addForm((f) => f.transport),
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

export function buildFailureFlow(): RuntimeStepper {
  return asStepper(
    new StepperBuilder()
      .withState(sharedShape)
      .createForm('device', deviceForm)
      .createForm('object', objectForm)
      .createForm('installer', installerForm)
      .createForm('fault', faultForm)
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Your product', subheading: 'Identify the product you are claiming.' } },
          (page) => page.addForm((f) => f.device),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Where it is used', subheading: 'The address for any on-site service.' } },
          (page) =>
            page.addForm((f) => f.object, {
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
            page.addForm((f) => f.installer, {
              bind: (l) => l.link((m) => m.email, (s) => s.email),
            }),
        ),
      )
      .createStep((step) =>
        step.createPage(
          { options: { heading: 'Describe the issue', subheading: 'What is wrong, and when you noticed.' } },
          (page) => page.addForm((f) => f.fault),
        ),
      )
      .build(),
  );
}

// The contact step links every field it shares with the rest of the wizard. `nip`
// is the visible one — pre-filled from the document step — but linking the
// company address too means a revisit keeps whatever the user last confirmed.
//
// It is shared by both flows, so it is named here rather than inlined twice. The
// call sites wrap it as `bind: (l) => contactLinks(l)` instead of `bind:
// contactLinks`: passing a pre-typed function by reference makes TypeScript stop
// inferring the selected form key `K` from the `(f) => f.contact` selector and
// fall back to the union of every pooled model. The one-line arrow keeps that
// inference, so `l` arrives correctly typed as the contact form's links.
const contactLinks = (l: SharedLink<ContactModel, typeof sharedShape>) =>
  l
    .link((m) => m.nip, (s) => s.nip)
    .link((m) => m.companyName, (s) => s.companyName)
    .link((m) => m.street, (s) => s.street)
    .link((m) => m.zip, (s) => s.zip)
    .link((m) => m.city, (s) => s.city)
    .link((m) => m.firstName, (s) => s.firstName)
    .link((m) => m.lastName, (s) => s.lastName)
    .link((m) => m.email, (s) => s.email);
