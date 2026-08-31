// Public surface of ngx-formad.

// Adapter wiring.
export * from './lib/provide';

// Layout axis.
export * from './lib/layout/layout-adapter';
export * from './lib/layout/css-layout';
export * from './lib/layout/class-layout';

// Control axis.
export * from './lib/controls/control-adapter';
export * from './lib/controls/default-controls';
export * from './lib/controls/default-control-adapter';

// Form description (over formodel) and the renderer.
export * from './lib/form-config/form-config';
export * from './lib/form-config/reactive';
export * from './lib/form-config/form-layout';
export * from './lib/renderer/instantiate-form';
export * from './lib/renderer/output-effect';
export * from './lib/renderer/field-outlet';
export * from './lib/renderer/component-outlet';
export * from './lib/renderer/content-view';
export * from './lib/renderer/control-outlet';
export * from './lib/renderer/nodes-view';
export * from './lib/renderer/form-renderer';

// Multi-step authoring: the typed builder chain and its node tree.
export * from './lib/builders/content';
export * from './lib/builders/dynamic-component';
export * from './lib/builders/shared-link';
export * from './lib/builders/standard-schema';
export * from './lib/builders/step-context';
export * from './lib/builders/nodes';
export * from './lib/builders/flow';
export * from './lib/builders/flow-port';
export * from './lib/builders/stepper-builder';

// Runtime: registry, completion fold, step materialization, the headless
// controller, the swappable chrome, and the shell that wires them.
export * from './lib/registry/instance-registry';
export * from './lib/runtime/materialize-step';
export * from './lib/runtime/effective-sequence';
export * from './lib/runtime/stepper-controller';
export * from './lib/runtime/flow-dock';
export * from './lib/runtime/wizard-context';
export * from './lib/runtime/step-forms-view';
export * from './lib/runtime/step-page-view';
export * from './lib/runtime/default-stepper-chrome';
export * from './lib/runtime/stepper.component';

// Cross-step shared state and the directional sync engine.
export * from './lib/sync/directional-sync';
export * from './lib/sync/shared-state';
export * from './lib/sync/field-sync';
