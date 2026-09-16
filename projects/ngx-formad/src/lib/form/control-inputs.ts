import { computed, isSignal, signal } from '@angular/core';
import { CUSTOM_FIELD } from 'formodel';
import { ControlOption } from '../controls';
import { ControlInputs } from './types/form-view';
import { FieldNode, SignalControlNode } from './types/ui-nodes';

type PresentationalNode = Exclude<SignalControlNode, { readonly type: typeof CUSTOM_FIELD }>;

/** The inputs a kind adds, each a signal; a derived one is a `computed`, so its identity holds until the source moves. */
function kindInputs(node: PresentationalNode): ControlInputs {
  switch (node.type) {
    case 'text':
    case 'email':
    case 'password':
    case 'tel':
    case 'url':
      return { type: signal(node.type) };
    case 'textarea':
      return node.rows != null ? { rows: isSignal(node.rows) ? node.rows : signal(node.rows) } : {};
    case 'select': {
      const options = isSignal(node.options) ? node.options : signal(node.options);

      return {
        options: computed((): ControlOption[] =>
          options().map((option) => ({ value: option.value, label: option.description })),
        ),
      };
    }
    case 'radio': {
      const options = isSignal(node.options) ? node.options : signal(node.options);

      return {
        options: computed((): ControlOption[] => options().map((option) => ({ value: option.value, label: option.label }))),
      };
    }
    case 'date': {
      if (node.limit === undefined) return {};

      const limit = isSignal(node.limit) ? node.limit : signal(node.limit);

      return { minDate: computed(() => limit().min), maxDate: computed(() => limit().max) };
    }
    case 'file':
      return {
        ...(node.accept ? { accept: isSignal(node.accept) ? node.accept : signal(node.accept) } : {}),
        ...(node.multiple != null ? { multiple: isSignal(node.multiple) ? node.multiple : signal(node.multiple) } : {}),
        ...(node.maxFiles != null ? { maxFiles: isSignal(node.maxFiles) ? node.maxFiles : signal(node.maxFiles) } : {}),
      };
    case 'checkbox':
      return node.innerHTML ? { innerHTML: isSignal(node.innerHTML) ? node.innerHTML : signal(node.innerHTML) } : {};
    default:
      return {};
  }
}

/** The inputs a control receives beyond the field binding: a custom node's `props`, or the node's presentational props. */
export function extraInputsFor(node: FieldNode): ControlInputs {
  if ('props' in node) return { props: signal(node.props) };
  if (node.type === CUSTOM_FIELD) return {};

  return {
    ...(node.label != null ? { label: isSignal(node.label) ? node.label : signal(node.label) } : {}),
    ...(node.placeholder ? { placeholder: isSignal(node.placeholder) ? node.placeholder : signal(node.placeholder) } : {}),
    ...kindInputs(node),
  };
}
