import { Provider, Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { FormConfig } from '../form-config/form-config';
import { ControlTypeMap } from '../provide';
import { SharedState } from '../sync/shared-state';
import { ContentBuild, buildContent } from './content';
import { ComponentCfg, Reactive, toBindings } from './dynamic-component';
import {
  FlowDefinition,
  FlowStepNode,
  isRecurrent,
  RecurrentFlowDefinition,
  RuntimeFlow,
  SequenceNode,
} from './flow';
import { DynamicPages, LayoutNode, LayoutNodeKind, PageNode, PageOptions, SequenceNodeKind } from './nodes';
import {
  FieldRef,
  FieldRefs,
  FormEffects,
  recordEffects,
  recordLinks,
  selectedKey,
  SharedLink,
} from './shared-link';
import {
  AnyFormProvider,
  ChildContext,
  DeferTrigger,
  ErasedRecord,
  ErasedValue,
  FormKeys,
  FormModel,
  FormProvider,
  GateContext,
  Rejected,
  RingContext,
  RuntimeFormSeed,
  RuntimeResultResolver,
  RuntimeStepCondition,
  RuntimeStepContext,
  SharedOf,
  StepCondition,
  StepContext,
  StepInstance,
  StepsOf,
  WithShared,
  WithSteps,
} from './step-context';
import { FormState } from '../renderer/instantiate-form';

/** The control kinds every stepper starts with; `addControlType` refuses to redeclare one. */
export type BuiltInControlKind =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'url'
  | 'textarea'
  | 'number'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'file';

type AnyForm = FormConfig<ErasedRecord>;

type UnionToIntersection<U> = (U extends U ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/** `K` when it is a new kind; a refusal naming the clash when `TKinds` already has it. */
export type UnregisteredKind<TKinds extends string, K extends string> = K extends TKinds
  ? Rejected<`kind '${K}' is already registered; use overrideControlType`>
  : string;

/** Accepts a `FormValueControl` component class; refuses anything else by name. */
export type ControlComponent<Cmp> = Cmp extends FormValueControl<infer _V>
  ? object
  : Rejected<'a control kind must be a FormValueControl component'>;

/** What a named step adds to the context: its instances, `| undefined` when gated by `when`. */
export type StepEntry<N extends string, Inst, O> = [N] extends [never]
  ? {}
  : Record<N, O extends { readonly when: infer _W } ? Inst | undefined : Inst>;

/** What an always-gated step (branch, pass) adds: its instances or `undefined`. */
export type GatedEntry<N extends string, Inst> = [N] extends [never] ? {} : Record<N, Inst | undefined>;

/** The values behind one step's instances: each form's model. */
export type StepValues<Inst> = {
  readonly [F in keyof NonNullable<Inst>]: NonNullable<Inst>[F] extends FormState<infer M>
    ? M
    : NonNullable<Inst>[F];
};

/** A linear flow's egress: the named steps' values, each possibly absent. */
export type StepsCommitted<TSteps> = { readonly [K in keyof TSteps]?: StepValues<TSteps[K]> };

/** The egress shape of a built stepper, for narrowing `stepCommitted` once at the boundary. */
export type CommittedOf<S> =
  S extends Stepper<infer _F, infer TCtx, infer _R> ? StepsCommitted<StepsOf<TCtx>> : never;

/** Placement options for a page content block. */
export interface ContentCfg {
  readonly layout?: string;

  readonly visibleWhen?: () => boolean;
}

/** Placement options for a pooled form: shared links, output effects and the local `initial` seed. */
export interface FormCfg<M, TCtx> {
  readonly submitLabel?: string;

  readonly visibleWhen?: () => boolean;

  readonly bind?: (link: SharedLink<M, SharedOf<TCtx>>) => void;

  readonly effects?: (e: FormEffects<M>) => void;

  readonly initial?: (ctx: TCtx) => Partial<M>;
}

type ErasedStepBuild = (step: never, ctx: never) => ErasedValue;

type RuntimeStepBuild = (
  step: StepBuilder<ErasedRecord, RuntimeStepContext>,
  ctx: RuntimeStepContext | undefined,
) => ErasedValue;

interface ErasedStepOptions {
  readonly name?: string;

  readonly label?: Reactive<string>;

  readonly when?: (ctx: never) => boolean;

  readonly optional?: boolean;

  readonly defer?: DeferTrigger;

  readonly completeWhen?: (ctx: never) => boolean;

  readonly incompleteMessage?: string;
}

interface StepAppend {
  readonly build: ErasedStepBuild;

  readonly opts: ErasedStepOptions;

  readonly guard?: RuntimeStepCondition;
}

type PushStep = (append: StepAppend) => void;

/** Builds one page: content, components and pooled forms; `P` accumulates the placed pool names. */
export class PageBuilder<TForms, TCtx, P = {}> {
  readonly __placed?: P;

  private readonly children: LayoutNode[] = [];

  addContent(build: ContentBuild, cfg?: ContentCfg): this;
  addContent(cfg?: ContentCfg, build?: ContentBuild): this;
  addContent(first?: ContentCfg | ContentBuild, second?: ContentCfg | ContentBuild): this {
    const cfg = typeof first === 'function' ? (second as ContentCfg | undefined) : first;
    const build = typeof first === 'function' ? first : (second as ContentBuild | undefined);
    this.children.push({
      kind: LayoutNodeKind.Content,
      layout: cfg?.layout,
      visibleWhen: cfg?.visibleWhen,
      children: build ? buildContent(build) : [],
    });

    return this;
  }

  addComponent<C extends object>(component: Type<C>, cfg: ComponentCfg<C>): this {
    this.children.push({
      kind: LayoutNodeKind.Component,
      component,
      bindings: toBindings(cfg),
      visibleWhen: cfg.visibleWhen,
      layout: cfg.layout,
    });

    return this;
  }

  insertRow<P2>(
    layout: string,
    build: (row: PageBuilder<TForms, TCtx, {}>) => PageBuilder<TForms, TCtx, P2>,
  ): PageBuilder<TForms, TCtx, P & P2> {
    const row = new PageBuilder<TForms, TCtx, {}>();
    build(row);
    this.children.push({ kind: LayoutNodeKind.Row, layout, children: row.drain() });

    return this;
  }

  addForm<K extends FormKeys<TForms> & string>(
    select: (forms: FieldRefs<TForms>) => FieldRef<K, ErasedValue>,
    opts: FormCfg<FormModel<TForms[K]>, TCtx> = {},
  ): PageBuilder<TForms, TCtx, P & Record<K, true>> {
    this.children.push({
      kind: LayoutNodeKind.Form,
      name: selectedKey<TForms>(select),
      submitLabel: opts.submitLabel,
      visibleWhen: opts.visibleWhen,
      links: opts.bind ? recordLinks(opts.bind) : [],
      effects: opts.effects ? recordEffects(opts.effects) : [],
      initial: opts.initial ? eraseSeed(opts.initial) : undefined,
    });

    return this;
  }

  drain(): LayoutNode[] {
    return this.children;
  }
}

/** Builds one step out of pages; `P` accumulates what the pages placed. */
export class StepBuilder<TForms, TCtx, P = {}> {
  readonly __placed?: P;

  private readonly pages: PageNode[] = [];

  createPage<P2>(
    meta: { options: PageOptions },
    build: (page: PageBuilder<TForms, TCtx, {}>) => PageBuilder<TForms, TCtx, P2>,
  ): StepBuilder<TForms, TCtx, P & P2> {
    const page = new PageBuilder<TForms, TCtx, {}>();
    build(page);
    this.pages.push({ options: meta.options, children: page.drain() });

    return this;
  }

  drainPages(): readonly PageNode[] {
    return this.pages;
  }
}

/** A step's build callback; declaring `ctx` makes the step dynamic (pages built on entry). */
export type StepBuild<TForms, TCtx, P> = (
  step: StepBuilder<TForms, TCtx, {}>,
  ctx: TCtx,
) => StepBuilder<TForms, TCtx, P>;

/** Per-step options; `name` is the key successors read the step under. */
export interface StepOptions<TCtx, N extends string = never> {
  readonly name?: N;

  readonly label?: Reactive<string>;

  readonly when?: StepCondition<TCtx>;

  readonly optional?: boolean;

  readonly defer?: DeferTrigger;

  readonly completeWhen?: StepCondition<TCtx>;

  readonly incompleteMessage?: string;
}

/** A branch selector: the branch key, or null/undefined while undecided (no branch in the sequence). */
export type BranchSelect<TCtx, K extends string> = (ctx: GateContext<TCtx>) => K | null | undefined;

/** The entries every arm of a `branch` adds, merged. */
export type BranchAdded<B> = UnionToIntersection<
  { [K in keyof B]: B[K] extends (b: never) => { __added?: infer A } ? A : never }[keyof B]
>;

/** Authors the steps of one branch; each is guarded by the branch condition. */
export class BranchBuilder<TForms, TCtx, TAdded = {}> {
  readonly __added?: TAdded;

  constructor(
    private readonly push: PushStep,
    private readonly guard: RuntimeStepCondition,
  ) {}

  step<N extends string = never, P = {}>(
    build: StepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: StepOptions<WithSteps<TCtx, TAdded>, N> = {},
  ): BranchBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>> {
    this.push({ build, opts, guard: this.guard });

    return this;
  }

  branch<
    K extends string,
    B extends Record<
      K,
      (b: BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>) => { __added?: ErasedValue }
    >,
  >(
    select: BranchSelect<WithSteps<TCtx, TAdded>, K>,
    branches: B,
  ): BranchBuilder<TForms, TCtx, TAdded & BranchAdded<B>> {
    const erased = eraseSelect(select);
    for (const key of Object.keys(branches) as K[]) {
      const nested: RuntimeStepCondition = (ctx) => this.guard(ctx) && erased(ctx) === key;
      branches[key](new BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>(this.push, nested));
    }

    return this;
  }
}

function claimName(name: string, pools: readonly Record<string, ErasedValue>[]): void {
  for (const pool of pools) {
    if (name in pool) throw new Error(`The name '${name}' is already taken.`);
  }
}

function combineConditions(
  guard: RuntimeStepCondition | undefined,
  own: RuntimeStepCondition | undefined,
): RuntimeStepCondition | undefined {
  if (guard && own) return (ctx) => guard(ctx) && own(ctx);

  return guard ?? own;
}

function appendStep(target: SequenceNode[], append: StepAppend): void {
  const { build, opts, guard } = append;
  target.push({
    kind: SequenceNodeKind.Step,
    name: opts.name,
    pages: pagesOf(build),
    label: opts.label,
    when: combineConditions(guard, opts.when ? eraseGate(opts.when) : undefined),
    optional: opts.optional,
    defer: opts.defer,
    completeWhen: opts.completeWhen ? eraseGate(opts.completeWhen) : undefined,
    incompleteMessage: opts.incompleteMessage,
  });
}

function pagesOf(build: ErasedStepBuild): readonly PageNode[] | DynamicPages {
  const run = eraseBuild(build);
  if (build.length >= 2) {
    return (ctx) => {
      const step = new StepBuilder<ErasedRecord, RuntimeStepContext>();
      run(step, ctx);
      return step.drainPages();
    };
  }

  const step = new StepBuilder<ErasedRecord, RuntimeStepContext>();
  run(step, undefined);
  return step.drainPages();
}

interface ForkArmDef {
  readonly forms: Record<string, AnyFormProvider>;

  readonly sharedInit: ErasedRecord;

  readonly steps: readonly SequenceNode[];

  readonly resolve: RuntimeResultResolver;
}

/** One finished fork arm, carrying its result type for `fork` to union. */
export interface ForkArm<R> {
  readonly __result?: R;

  readonly _def: ForkArmDef;
}

/** Authors one fork arm: its own state, forms and steps, ending in `result`. */
export class ForkArmBuilder<TForms, TCtx, TAdded = {}> {
  private forms: Record<string, AnyFormProvider> = {};

  private sharedInit: ErasedRecord = {};

  private readonly steps: SequenceNode[] = [];

  withState<S extends ErasedRecord>(initial: S): ForkArmBuilder<TForms, WithShared<TCtx, S>, TAdded> {
    this.sharedInit = { ...this.sharedInit, ...initial };

    return this;
  }

  createForm<K extends string, M extends ErasedRecord>(
    name: K,
    provider: FormProvider<M>,
  ): ForkArmBuilder<TForms & Record<K, FormConfig<M>>, TCtx, TAdded> {
    claimName(name, [this.forms]);
    this.forms = { ...this.forms, [name]: eraseProvider(provider) };

    return this;
  }

  createStep<N extends string = never, P = {}>(
    build: StepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: StepOptions<WithSteps<TCtx, TAdded>, N> = {},
  ): ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>> {
    appendStep(this.steps, { build, opts });

    return this;
  }

  branch<
    K extends string,
    B extends Record<
      K,
      (b: BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>) => { __added?: ErasedValue }
    >,
  >(
    select: BranchSelect<WithSteps<TCtx, TAdded>, K>,
    branches: B,
  ): ForkArmBuilder<TForms, TCtx, TAdded & BranchAdded<B>> {
    const erased = eraseSelect(select);
    for (const key of Object.keys(branches) as K[]) {
      const guard: RuntimeStepCondition = (ctx) => erased(ctx) === key;
      branches[key](
        new BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>(
          (append) => appendStep(this.steps, append),
          guard,
        ),
      );
    }

    return this;
  }

  result<R>(resolve: (ctx: GateContext<WithSteps<TCtx, TAdded>>) => R): ForkArm<R> {
    return {
      _def: {
        forms: this.forms,
        sharedInit: this.sharedInit,
        steps: this.steps,
        resolve: eraseResolver(resolve),
      },
    };
  }
}

/** A forked chain: nothing may follow, only `build()`. */
export interface TerminalForkBuilder<TForms, TCtx, TResult> {
  build(): Stepper<TForms, TCtx, TResult>;
}

type ForkArms<TForms, TCtx> = Record<string, (arm: ForkArmBuilder<TForms, TCtx>) => ForkArm<ErasedValue>>;

type ArmResult<A> = {
  [P in keyof A]: A[P] extends (arm: never) => ForkArm<infer R> ? R : never;
}[keyof A];

/** Everything a built linear flow is made of; the runtime reads it through `asStepper`. */
export interface StepperDefinition<TForms, TShared extends ErasedRecord> {
  readonly forms: TForms;

  readonly steps: readonly SequenceNode[];

  readonly shared: SharedState<TShared>;

  readonly resolveResult?: RuntimeResultResolver;

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];
}

/** A built linear flow: typed pool, sequence, shared store, control kinds, providers and fork result. */
export class Stepper<TForms, TCtx, TResult = never> {
  readonly __result?: TResult;

  readonly forms: TForms;

  readonly steps: readonly SequenceNode[];

  readonly shared: SharedState<SharedOf<TCtx>>;

  readonly resolveResult?: RuntimeResultResolver;

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  constructor(definition: StepperDefinition<TForms, SharedOf<TCtx>>) {
    this.forms = definition.forms;
    this.steps = definition.steps;
    this.shared = definition.shared;
    this.resolveResult = definition.resolveResult;
    this.controlTypes = definition.controlTypes;
    this.providers = definition.providers;
  }
}

/** A linear flow with its authoring types erased, as `<ngx-formad-stepper>` takes it. */
export type RuntimeStepper = Stepper<Record<string, AnyForm>, RuntimeStepContext, ErasedValue>;

/** The single erasure point from a typed linear flow to the runtime shape. */
export function asStepper<TForms, TCtx, TResult>(
  stepper: Stepper<TForms, TCtx, TResult>,
): RuntimeStepper {
  return stepper as unknown as RuntimeStepper;
}

/** The parent-side options of a nested flow slot. */
export interface FlowStepOptions<TCtx> {
  readonly label?: Reactive<string>;

  readonly when?: StepCondition<TCtx>;

  readonly defer?: DeferTrigger;
}

/** A ring's accumulator: its initial state and, optionally, when the dock counts as reachable. */
export interface RingCfg<C> {
  readonly initial: () => C;

  readonly dockReachable?: (state: C) => boolean;
}

/** A nested linear flow: slot options plus the callback authoring the sub-flow. */
export type LinearFlowStep<TKinds extends string, TCtx, TBuilt> = FlowStepOptions<TCtx> & {
  readonly build: (sub: StepperBuilder<{}, TKinds, ChildContext<TCtx>>) => TBuilt;
};

/** A nested ring: slot options, its accumulator and the callback authoring the ring (ending in `dock`). */
export type RecurrentFlowStep<C, TKinds extends string, TCtx, TTerminal> = FlowStepOptions<TCtx> &
  RingCfg<C> & {
    readonly build: (loop: RecurrentStepperBuilder<{}, C, TKinds, RingContext<TCtx, C>>) => TTerminal;
  };

/** The root of a linear chain; `build()` freezes it into a `Stepper`. */
export class StepperBuilder<
  TForms = {},
  TKinds extends string = BuiltInControlKind,
  TCtx = StepContext<{}, {}, undefined, undefined>,
> {
  readonly __context?: TCtx;

  private forms: Record<string, AnyFormProvider> = {};

  private sharedInit: ErasedRecord = {};

  private readonly steps: SequenceNode[] = [];

  private resultResolver?: RuntimeResultResolver;

  private controlTypes: ControlTypeMap = {};

  private readonly providers: Provider[] = [];

  private readonly stepNames: Record<string, true> = {};

  addControlType<K extends string, Cmp extends object>(
    kind: K & UnregisteredKind<TKinds, K>,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): StepperBuilder<TForms, TKinds | K, TCtx> {
    this.controlTypes = { ...this.controlTypes, [kind]: component };

    return this;
  }

  overrideControlType<K extends TKinds, Cmp extends object>(
    kind: K,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): this {
    this.controlTypes = { ...this.controlTypes, [kind]: component };

    return this;
  }

  provide(...providers: Provider[]): this {
    this.providers.push(...providers);

    return this;
  }

  withState<S extends ErasedRecord>(initial: S): StepperBuilder<TForms, TKinds, WithShared<TCtx, S>> {
    this.sharedInit = { ...this.sharedInit, ...initial };

    return this;
  }

  createForm<K extends string, M extends ErasedRecord>(
    name: K,
    provider: FormProvider<M>,
  ): StepperBuilder<TForms & Record<K, FormConfig<M>>, TKinds, TCtx> {
    claimName(name, [this.forms]);
    this.forms = { ...this.forms, [name]: eraseProvider(provider) };

    return this;
  }

  createStep<N extends string = never, P = {}, O extends StepOptions<TCtx, N> = StepOptions<TCtx, N>>(
    build: StepBuild<TForms, TCtx, P>,
    opts?: O & { readonly name?: N },
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>> {
    this.pushStep({ build, opts: opts ?? {} });

    return this;
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, TCtx, {}>) => { __added?: ErasedValue }>,
  >(
    select: BranchSelect<TCtx, K>,
    branches: B,
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, BranchAdded<B>>> {
    const erased = eraseSelect(select);
    for (const key of Object.keys(branches) as K[]) {
      const guard: RuntimeStepCondition = (ctx) => erased(ctx) === key;
      branches[key](new BranchBuilder<TForms, TCtx, {}>((append) => this.pushStep(append), guard));
    }

    return this;
  }

  fork<A extends ForkArms<TForms, TCtx>>(
    select: (ctx: GateContext<TCtx>) => string,
    arms: A,
  ): TerminalForkBuilder<TForms, TCtx, ArmResult<A>> {
    const erased = eraseSelect(select);
    const resolvers: Record<string, RuntimeResultResolver> = {};
    for (const key of Object.keys(arms) as (keyof A & string)[]) {
      const def = arms[key](new ForkArmBuilder<TForms, TCtx>())._def;
      this.forms = { ...this.forms, ...def.forms };
      this.sharedInit = { ...this.sharedInit, ...def.sharedInit };
      const guard: RuntimeStepCondition = (ctx) => erased(ctx) === key;
      for (const node of def.steps) {
        this.steps.push({ ...node, when: combineConditions(guard, node.when) });
      }
      resolvers[key] = def.resolve;
    }
    this.resultResolver = (ctx) => resolvers[erased(ctx) ?? '']?.(ctx);

    return this;
  }

  createStepper<N extends string, F2, TK2 extends string, TCtx2, O extends FlowStepOptions<TCtx>>(
    name: N,
    flow: O & LinearFlowStep<TKinds, TCtx, StepperBuilder<F2, TK2, TCtx2>>,
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepsCommitted<StepsOf<TCtx2>>, O>>> {
    claimName(name, [this.stepNames]);
    this.stepNames[name] = true;
    const sub = new StepperBuilder<{}, TKinds, ChildContext<TCtx>>();
    this.steps.push(flowStepNode({ name, flow: erasedFlow(flow.build(sub).build()) }, flow));

    return this;
  }

  createRecurrentStepper<N extends string, C, F2, TCtx2, O extends FlowStepOptions<TCtx>>(
    name: N,
    ring: O & RecurrentFlowStep<C, TKinds, TCtx, RecurrentTerminal<F2, TCtx2, C>>,
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, C, O>>> {
    claimName(name, [this.stepNames]);
    this.stepNames[name] = true;
    const loop = new RecurrentStepperBuilder<{}, C, TKinds, RingContext<TCtx, C>>(ring);
    this.steps.push(flowStepNode({ name, flow: asRecurrentStepper(ring.build(loop).build()) }, ring));

    return this;
  }

  build(): Stepper<TForms, TCtx, never> {
    return new Stepper<TForms, TCtx, never>({
      forms: retype<TForms>(this.forms),
      steps: this.steps,
      shared: new SharedState(retype<SharedOf<TCtx>>(this.sharedInit)),
      resolveResult: this.resultResolver,
      controlTypes: this.controlTypes,
      providers: this.providers,
    });
  }

  private pushStep(append: StepAppend): void {
    const name = append.opts.name;
    if (name !== undefined) {
      claimName(name, [this.stepNames]);
      this.stepNames[name] = true;
    }
    appendStep(this.steps, append);
  }
}

interface ErasedFlowStepOptions {
  readonly label?: Reactive<string>;

  readonly when?: (ctx: never) => boolean;

  readonly defer?: DeferTrigger;
}

interface FlowSlot {
  readonly name: string;

  readonly flow: RuntimeFlow;
}

function flowStepNode(slot: FlowSlot, opts: ErasedFlowStepOptions): FlowStepNode {
  const { name, flow } = slot;
  const complete = isRecurrent(flow) ? flow.complete : undefined;
  const initial = isRecurrent(flow) ? flow.initial : undefined;

  return {
    kind: SequenceNodeKind.Flow,
    name,
    flow,
    label: opts.label,
    when: opts.when ? eraseGate(opts.when) : undefined,
    defer: opts.defer,
    completeWhen: complete && initial ? (ctx) => complete(ctx.steps[name] ?? initial()) : undefined,
    incompleteMessage: isRecurrent(flow) ? flow.incompleteMessage : undefined,
  };
}

/** The single erasure point from a typed nested linear flow to the runtime shape. */
export function erasedFlow<TForms, TCtx, TResult>(stepper: Stepper<TForms, TCtx, TResult>): FlowDefinition {
  return stepper as unknown as FlowDefinition;
}

/** A ring after `dock()`: only `build()` remains. */
export interface RecurrentTerminal<TForms, TCtx, C> {
  build(): RecurrentStepper<TForms, TCtx, C>;
}

/** A built ring; hand it to `<ngx-formad-stepper>` via `asRecurrentStepper` or nest it. */
export class RecurrentStepper<TForms, TCtx, C> {
  readonly __types?: { forms: TForms; context: TCtx };

  constructor(readonly definition: RecurrentFlowDefinition<C>) {}
}

/** The single erasure point from a typed ring to the runtime shape. */
export function asRecurrentStepper<TForms, TCtx, C>(stepper: RecurrentStepper<TForms, TCtx, C>): RuntimeFlow {
  return stepper.definition as unknown as RuntimeFlow;
}

/** The root of a ring: pass steps, `fold`, `completeWhen`, then `dock` last. */
export class RecurrentStepperBuilder<
  TForms = {},
  C = unknown,
  TKinds extends string = BuiltInControlKind,
  TCtx = StepContext<{}, {}, undefined, RecurrentSignalsOf<C>>,
> {
  readonly __context?: TCtx;

  private forms: Record<string, AnyFormProvider> = {};

  private sharedInit: ErasedRecord = {};

  private readonly steps: SequenceNode[] = [];

  private controlTypes: ControlTypeMap = {};

  private readonly providers: Provider[] = [];

  private readonly stepNames: Record<string, true> = {};

  private dockIndex = -1;

  private foldFn?: (state: C, pass: TCtx) => C;

  private completePredicate?: (state: C) => boolean;

  private completeMessage?: string;

  constructor(private readonly ring: RingCfg<C>) {}

  provide(...providers: Provider[]): this {
    this.providers.push(...providers);

    return this;
  }

  withState<S extends ErasedRecord>(
    initial: S,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithShared<TCtx, S>> {
    this.sharedInit = { ...this.sharedInit, ...initial };

    return this;
  }

  createForm<K extends string, M extends ErasedRecord>(
    name: K,
    provider: FormProvider<M>,
  ): RecurrentStepperBuilder<TForms & Record<K, FormConfig<M>>, C, TKinds, TCtx> {
    claimName(name, [this.forms]);
    this.forms = { ...this.forms, [name]: eraseProvider(provider) };

    return this;
  }

  addControlType<K extends string, Cmp extends object>(
    kind: K & UnregisteredKind<TKinds, K>,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): RecurrentStepperBuilder<TForms, C, TKinds | K, TCtx> {
    this.controlTypes = { ...this.controlTypes, [kind]: component };

    return this;
  }

  overrideControlType<K extends TKinds, Cmp extends object>(
    kind: K,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): this {
    this.controlTypes = { ...this.controlTypes, [kind]: component };

    return this;
  }

  createStep<N extends string = never, P = {}>(
    build: StepBuild<TForms, TCtx, P>,
    opts: StepOptions<TCtx, N> = {},
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>> {
    this.pushStep({ build, opts, guard: passGate });

    return this;
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, TCtx, {}>) => { __added?: ErasedValue }>,
  >(
    select: BranchSelect<TCtx, K>,
    branches: B,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, BranchAdded<B>>> {
    const erased = eraseSelect(select);
    for (const key of Object.keys(branches) as K[]) {
      const guard: RuntimeStepCondition = (ctx) => passGate(ctx) && erased(ctx) === key;
      branches[key](new BranchBuilder<TForms, TCtx, {}>((append) => this.pushStep(append), guard));
    }

    return this;
  }

  createStepper<N extends string, F2, TK2 extends string, TCtx2, O extends FlowStepOptions<TCtx>>(
    name: N,
    flow: O & LinearFlowStep<TKinds, TCtx, StepperBuilder<F2, TK2, TCtx2>>,
  ): RecurrentStepperBuilder<
    TForms,
    C,
    TKinds,
    WithSteps<TCtx, GatedEntry<N, StepsCommitted<StepsOf<TCtx2>>>>
  > {
    claimName(name, [this.stepNames]);
    this.stepNames[name] = true;
    const sub = new StepperBuilder<{}, TKinds, ChildContext<TCtx>>();
    const node = flowStepNode({ name, flow: erasedFlow(flow.build(sub).build()) }, flow);
    this.steps.push({ ...node, when: combineConditions(passGate, node.when) });

    return this;
  }

  createRecurrentStepper<N extends string, C2, F2, TCtx2, O extends FlowStepOptions<TCtx>>(
    name: N,
    ring: O & RecurrentFlowStep<C2, TKinds, TCtx, RecurrentTerminal<F2, TCtx2, C2>>,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, C2>>> {
    claimName(name, [this.stepNames]);
    this.stepNames[name] = true;
    const loop = new RecurrentStepperBuilder<{}, C2, TKinds, RingContext<TCtx, C2>>(ring);
    const node = flowStepNode({ name, flow: asRecurrentStepper(ring.build(loop).build()) }, ring);
    this.steps.push({ ...node, when: combineConditions(passGate, node.when) });

    return this;
  }

  fold(fold: (state: C, pass: TCtx) => C): this {
    this.foldFn = fold;

    return this;
  }

  completeWhen(complete: (state: C) => boolean, message?: string): this {
    this.completePredicate = complete;
    this.completeMessage = message;

    return this;
  }

  dock<N extends string = never, P = {}>(
    build: StepBuild<TForms, TCtx, P>,
    opts: StepOptions<TCtx, N> = {},
  ): RecurrentTerminal<TForms, TCtx, C> {
    if (this.dockIndex >= 0) throw new Error('A recurrent flow has exactly one dock.');

    this.dockIndex = this.steps.length;
    const own = opts.completeWhen ? eraseGate(opts.completeWhen) : undefined;
    const gate: RuntimeStepCondition = (ctx) => {
      if (own && !own(ctx)) return false;
      if (!this.completePredicate) return true;

      return this.completePredicate(ctx.flow ? (ctx.flow.state() as C) : this.ring.initial());
    };
    this.pushStep({
      build,
      opts: { ...opts, completeWhen: gate, incompleteMessage: opts.incompleteMessage ?? this.completeMessage },
      guard: dockGate,
    });

    return this;
  }

  build(): RecurrentStepper<TForms, TCtx, C> {
    return new RecurrentStepper(this._drain());
  }

  _drain(): RecurrentFlowDefinition<C> {
    if (this.dockIndex < 0) {
      throw new Error('A recurrent flow needs a dock - author it last with dock().');
    }

    return {
      recurrent: true,
      steps: this.steps,
      forms: this.forms,
      shared: new SharedState(this.sharedInit),
      controlTypes: this.controlTypes,
      providers: this.providers,
      dockAt: this.dockIndex,
      initial: this.ring.initial,
      fold: this.foldFn ? eraseFold(this.foldFn) : undefined,
      dockReachable: this.ring.dockReachable,
      complete: this.completePredicate,
      incompleteMessage: this.completeMessage,
    };
  }

  private pushStep(append: StepAppend): void {
    const name = append.opts.name;
    if (name !== undefined) {
      claimName(name, [this.stepNames]);
      this.stepNames[name] = true;
    }
    appendStep(this.steps, append);
  }
}

type RecurrentSignalsOf<C> = RingContext<StepContext<{}, {}, undefined, undefined>, C>['flow'];

const passGate: RuntimeStepCondition = (ctx) => ctx.flow?.passOpen() === true;

const dockGate: RuntimeStepCondition = (ctx) => ctx.flow?.passOpen() !== true;
