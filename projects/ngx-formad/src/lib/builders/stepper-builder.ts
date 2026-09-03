import { Provider, Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { Reactive } from 'formodel';
import { FormConfig } from '../form-config/form-config';
import { ControlTypeMap } from '../provide';
import { FormState } from '../renderer/instantiate-form';
import { SharedState } from '../sync/shared-state';
import { ContentBuild, buildContent } from './content';
import { ComponentCfg, toBindings } from './dynamic-component';
import {
  FlowDefinition,
  FlowStepNode,
  isRecurrent,
  RecurrentFlowDefinition,
  RuntimeFlow,
  SequenceNode,
} from './flow';
import {
  DynamicPages,
  LayoutNode,
  LayoutNodeKind,
  PageNode,
  PageOptions,
  SequenceNodeKind,
  StepNode,
} from './nodes';
import { FormEffects, recordEffects, recordLinks, SharedLinks } from './shared-link';
import {
  AnyFormProvider,
  ChildContext,
  DeferTrigger,
  FormKeys,
  FormModel,
  FormProvider,
  GateContext,
  RecurrentSignals,
  Rejected,
  RingContext,
  RootContext,
  RuntimeStepContext,
  SharedSignals,
  StepCondition,
  StepContext,
  StepGate,
  StepInstance,
  WithShared,
  WithSteps,
} from './step-context';

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

type UnionToIntersection<U> = (U extends U ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/** `string` when `K` is a new kind; a refusal naming the clash when `TKinds` already has it. */
export type UnregisteredKind<TKinds extends string, K extends string> = K extends TKinds
  ? Rejected<`kind '${K}' is already registered; use overrideControlType`>
  : string;

/** `object` for a `FormValueControl` component class; a refusal naming the problem otherwise. */
export type ControlComponent<Cmp> = Cmp extends FormValueControl<infer _V>
  ? object
  : Rejected<'a control kind must be a FormValueControl component'>;

/** What a named step adds to the context: its instances, `| undefined` when gated by `when`. */
export type StepEntry<N extends string, Inst, O> = [N] extends [never]
  ? {}
  : Record<N, O extends { readonly when: infer _W } ? Inst | undefined : Inst>;

/** What an always-gated step adds: its instances or `undefined`. */
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
  S extends Stepper<infer _F, infer TCtx, infer _R> ? StepsCommitted<TCtx['steps']> : never;

/** Placement options for a page content block. */
export interface ContentCfg {
  readonly layout?: string;

  readonly visibleWhen?: () => boolean;
}

/** Placement options for a pooled form: shared links, output effects and the local `initial` seed. */
export interface FormCfg<M extends Record<string, unknown>, TCtx extends RuntimeStepContext> {
  readonly submitLabel?: string;

  readonly visibleWhen?: () => boolean;

  readonly bind?: SharedLinks<M, TCtx['shared']>;

  readonly effects?: FormEffects<M>;

  readonly initial?: (ctx: TCtx) => Partial<M>;
}

/** Builds one page: content, components and pooled forms; `P` accumulates the placed pool names. */
export class PageBuilder<TForms, TCtx extends RuntimeStepContext, P = {}> {
  readonly __placed?: P;

  constructor(readonly nodes: readonly LayoutNode[] = []) {}

  addContent(build?: ContentBuild, cfg: ContentCfg = {}): PageBuilder<TForms, TCtx, P> {
    return this.with({
      kind: LayoutNodeKind.Content,
      layout: cfg.layout,
      visibleWhen: cfg.visibleWhen,
      children: build ? buildContent(build) : [],
    });
  }

  addComponent<C extends object>(component: Type<C>, cfg: ComponentCfg<C>): PageBuilder<TForms, TCtx, P> {
    return this.with({
      kind: LayoutNodeKind.Component,
      component,
      bindings: toBindings(cfg),
      visibleWhen: cfg.visibleWhen,
      layout: cfg.layout,
    });
  }

  insertRow<P2>(
    layout: string,
    build: (row: PageBuilder<TForms, TCtx, {}>) => PageBuilder<TForms, TCtx, P2>,
  ): PageBuilder<TForms, TCtx, P & P2> {
    const row = build(new PageBuilder<TForms, TCtx, {}>());

    return new PageBuilder<TForms, TCtx, P & P2>([
      ...this.nodes,
      { kind: LayoutNodeKind.Row, layout, children: row.nodes },
    ]);
  }

  addForm<K extends FormKeys<TForms>>(
    name: K,
    opts: FormCfg<FormModel<TForms[K]>, TCtx> = {},
  ): PageBuilder<TForms, TCtx, P & Record<K, true>> {
    return new PageBuilder<TForms, TCtx, P & Record<K, true>>([
      ...this.nodes,
      {
        kind: LayoutNodeKind.Form,
        name,
        submitLabel: opts.submitLabel,
        visibleWhen: opts.visibleWhen,
        links: opts.bind ? recordLinks(opts.bind) : [],
        effects: opts.effects ? recordEffects(opts.effects) : [],
        initial: opts.initial,
      },
    ]);
  }

  private with(node: LayoutNode): PageBuilder<TForms, TCtx, P> {
    return new PageBuilder<TForms, TCtx, P>([...this.nodes, node]);
  }
}

/** Builds one step out of pages; `P` accumulates what the pages placed. */
export class StepBuilder<TForms, TCtx extends RuntimeStepContext, P = {}> {
  readonly __placed?: P;

  constructor(readonly pages: readonly PageNode[] = []) {}

  createPage<P2>(
    meta: { options: PageOptions },
    build: (page: PageBuilder<TForms, TCtx, {}>) => PageBuilder<TForms, TCtx, P2>,
  ): StepBuilder<TForms, TCtx, P & P2> {
    const page = build(new PageBuilder<TForms, TCtx, {}>());

    return new StepBuilder<TForms, TCtx, P & P2>([
      ...this.pages,
      { options: meta.options, children: page.nodes },
    ]);
  }
}

/** A step's build callback; one that declares the context parameter runs on entry, with the live context. */
export type StepBuild<TForms, TCtx extends RuntimeStepContext, P> = (
  step: StepBuilder<TForms, TCtx, {}>,
  ctx: TCtx,
) => StepBuilder<TForms, TCtx, P>;

/** Per-step options; `name` is the key successors read the step under. */
export interface StepOptions<TCtx extends RuntimeStepContext, N extends string = never> {
  readonly name?: N;

  readonly label?: Reactive<string>;

  readonly when?: StepCondition<TCtx>;

  readonly optional?: boolean;

  readonly defer?: DeferTrigger;

  readonly completeWhen?: StepCondition<TCtx>;

  readonly incompleteMessage?: string;
}

/** A branch selector: the branch key, or null/undefined while undecided. */
export type BranchSelect<TCtx extends RuntimeStepContext, K extends string> = (
  ctx: GateContext<TCtx>,
) => K | null | undefined;

/** The entries every arm of a `branch` adds, merged. */
export type BranchAdded<B> = UnionToIntersection<
  { [K in keyof B]: B[K] extends (b: never) => { __added?: infer A } ? A : never }[keyof B]
>;

type PushStep = (node: SequenceNode) => void;

interface StepSpec<TCtx extends RuntimeStepContext> {
  readonly pages: readonly PageNode[] | DynamicPages;

  readonly opts: StepOptions<TCtx, string>;

  readonly gate?: StepGate;
}

const AUTHORING_CONTEXT: RuntimeStepContext = { steps: {}, shared: {}, flow: undefined, parent: undefined };

function pagesOf<TForms, TCtx extends RuntimeStepContext, P>(
  build: StepBuild<TForms, TCtx, P>,
): readonly PageNode[] | DynamicPages {
  const dynamic: DynamicPages = { build: (ctx: TCtx) => build(new StepBuilder<TForms, TCtx, {}>(), ctx).pages };

  return build.length < 2 ? dynamic.build(AUTHORING_CONTEXT) : dynamic;
}

function guardedBy(gate: StepGate, node: SequenceNode): SequenceNode {
  const own = node.when;

  return { ...node, when: (ctx) => gate.when(ctx) && (own ? own(ctx) : true) };
}

function stepNode<TCtx extends RuntimeStepContext>(spec: StepSpec<TCtx>): SequenceNode {
  const { pages, opts, gate } = spec;
  const node: StepNode = {
    kind: SequenceNodeKind.Step,
    name: opts.name,
    pages,
    label: opts.label,
    when: opts.when,
    optional: opts.optional,
    defer: opts.defer,
    completeWhen: opts.completeWhen,
    incompleteMessage: opts.incompleteMessage,
  };

  return gate ? guardedBy(gate, node) : node;
}

function claimName(name: string, taken: object): void {
  if (name in taken) throw new Error(`The name '${name}' is already taken.`);
}

/** Authors the steps of one branch; each is guarded by the branch condition. */
export class BranchBuilder<TForms, TCtx extends RuntimeStepContext, TAdded = {}> {
  readonly __added?: TAdded;

  constructor(
    private readonly push: PushStep,
    private readonly gate: StepGate,
  ) {}

  step<N extends string = never, P = {}>(
    build: StepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: StepOptions<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>, N> = {},
  ): BranchBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>> {
    this.push(stepNode({ pages: pagesOf(build), opts, gate: this.gate }));

    return new BranchBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>(
      this.push,
      this.gate,
    );
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>) => { __added?: unknown }>,
  >(
    select: BranchSelect<WithSteps<TCtx, TAdded>, K>,
    branches: B,
  ): BranchBuilder<TForms, TCtx, TAdded & BranchAdded<B>> {
    for (const key in branches) {
      const nested: StepGate = {
        when: (ctx: GateContext<WithSteps<TCtx, TAdded>>) => {
          if (!this.gate.when(ctx)) return false;

          const selected: string | null | undefined = select(ctx);

          return selected === key;
        },
      };
      branches[key](new BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>(this.push, nested));
    }

    return new BranchBuilder<TForms, TCtx, TAdded & BranchAdded<B>>(this.push, this.gate);
  }
}

interface ArmState {
  readonly forms: Readonly<Record<string, AnyFormProvider>>;

  readonly shared: SharedState;

  readonly steps: readonly SequenceNode[];
}

/** One finished fork arm: its pool, state slice, steps and typed result resolver. */
export interface ForkArm<R = unknown> extends ArmState {
  readonly __result?: R;

  resolve(ctx: RuntimeStepContext): R;
}

const EMPTY_ARM: ArmState = { forms: {}, shared: new SharedState({}), steps: [] };

/** Authors one fork arm: its own state, forms and steps, ending in `result`. */
export class ForkArmBuilder<TForms, TCtx extends RuntimeStepContext, TAdded = {}> {
  constructor(private readonly arm: ArmState = EMPTY_ARM) {}

  withState<S extends Record<string, unknown>>(initial: S): ForkArmBuilder<TForms, WithShared<TCtx, S>, TAdded> {
    return new ForkArmBuilder<TForms, WithShared<TCtx, S>, TAdded>({
      ...this.arm,
      shared: new SharedState({ ...this.arm.shared.snapshot(), ...initial }),
    });
  }

  createForm<K extends string, M extends Record<string, unknown>>(
    name: K,
    provider: FormProvider<M> & AnyFormProvider,
  ): ForkArmBuilder<TForms & Record<K, FormConfig<M>>, TCtx, TAdded> {
    claimName(name, this.arm.forms);

    return new ForkArmBuilder<TForms & Record<K, FormConfig<M>>, TCtx, TAdded>({
      ...this.arm,
      forms: { ...this.arm.forms, [name]: provider },
    });
  }

  createStep<N extends string = never, P = {}>(
    build: StepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: StepOptions<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>, N> = {},
  ): ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>> {
    return new ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>({
      ...this.arm,
      steps: [...this.arm.steps, stepNode({ pages: pagesOf(build), opts })],
    });
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>) => { __added?: unknown }>,
  >(
    select: BranchSelect<WithSteps<TCtx, TAdded>, K>,
    branches: B,
  ): ForkArmBuilder<TForms, TCtx, TAdded & BranchAdded<B>> {
    const steps: SequenceNode[] = [];
    for (const key in branches) {
      const gate: StepGate = {
        when: (ctx: GateContext<WithSteps<TCtx, TAdded>>) => {
          const selected: string | null | undefined = select(ctx);

          return selected === key;
        },
      };
      branches[key](new BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>((node) => steps.push(node), gate));
    }

    return new ForkArmBuilder<TForms, TCtx, TAdded & BranchAdded<B>>({
      ...this.arm,
      steps: [...this.arm.steps, ...steps],
    });
  }

  result<R>(resolve: (ctx: GateContext<WithSteps<TCtx, TAdded>>) => R): ForkArm<R> {
    return { ...this.arm, resolve };
  }
}

/** A forked chain: nothing may follow, only `build()`. */
export interface TerminalForkBuilder<TForms, TCtx extends RuntimeStepContext, TResult> {
  build(): Stepper<TForms, TCtx, TResult>;
}

type ForkArms<TForms, TCtx extends RuntimeStepContext> = Record<
  string,
  (arm: ForkArmBuilder<TForms, TCtx>) => ForkArm
>;

type ArmResult<A> = {
  [P in keyof A]: A[P] extends (arm: never) => ForkArm<infer R> ? R : never;
}[keyof A];

/** A built linear flow: the runtime shape plus the authoring types it was built with. */
export class Stepper<TForms = {}, TCtx extends RuntimeStepContext = RuntimeStepContext, TResult = unknown>
  implements FlowDefinition
{
  readonly __forms?: TForms;

  readonly __context?: TCtx;

  readonly __result?: TResult;

  readonly forms: Readonly<Record<string, AnyFormProvider>>;

  readonly steps: readonly SequenceNode[];

  readonly shared: SharedState;

  readonly resolveResult?: FlowDefinition['resolveResult'];

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  constructor(definition: FlowDefinition) {
    this.forms = definition.forms;
    this.steps = definition.steps;
    this.shared = definition.shared;
    this.resolveResult = definition.resolveResult;
    this.controlTypes = definition.controlTypes;
    this.providers = definition.providers;
  }
}

/** A linear flow with its authoring types erased, as `<ngx-formad-stepper>` takes it. */
export type RuntimeStepper = Stepper;

/** The parent-side options of a nested flow slot. */
export interface FlowStepOptions<TCtx extends RuntimeStepContext> {
  readonly label?: Reactive<string>;

  readonly when?: StepCondition<TCtx>;

  readonly defer?: DeferTrigger;
}

/** A ring's accumulator: its initial state and, optionally, when the dock counts as reachable. */
export interface RingCfg<C> {
  readonly initial: () => C;

  dockReachable?(state: C): boolean;
}

/** A nested linear flow: slot options plus the callback authoring the sub-flow. */
export type LinearFlowStep<TKinds extends string, TCtx extends RuntimeStepContext, TBuilt> = FlowStepOptions<TCtx> & {
  readonly build: (sub: StepperBuilder<{}, TKinds, ChildContext<TCtx>>) => TBuilt;
};

/** A nested ring: slot options, its accumulator and the callback authoring the ring, ending in `dock`. */
export type RecurrentFlowStep<C, TKinds extends string, TCtx extends RuntimeStepContext, TTerminal> = FlowStepOptions<TCtx> &
  RingCfg<C> & {
    readonly build: (loop: RecurrentStepperBuilder<{}, C, TKinds, RingContext<TCtx, C>>) => TTerminal;
  };

interface FlowSlot<TCtx extends RuntimeStepContext> {
  readonly name: string;

  readonly flow: RuntimeFlow;

  readonly opts: FlowStepOptions<TCtx>;
}

function flowStepNode<TCtx extends RuntimeStepContext>(slot: FlowSlot<TCtx>): FlowStepNode {
  const ring = isRecurrent(slot.flow) ? slot.flow : null;
  const complete = ring?.complete;

  return {
    kind: SequenceNodeKind.Flow,
    name: slot.name,
    flow: slot.flow,
    label: slot.opts.label,
    when: slot.opts.when,
    defer: slot.opts.defer,
    completeWhen: ring && complete ? (ctx) => complete(ctx.steps[slot.name] ?? ring.initial()) : undefined,
    incompleteMessage: ring?.incompleteMessage,
  };
}

interface ChainState {
  readonly forms: Readonly<Record<string, AnyFormProvider>>;

  readonly shared: SharedState;

  readonly steps: readonly SequenceNode[];

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  readonly stepNames: Readonly<Record<string, true>>;
}

const EMPTY_CHAIN: ChainState = {
  forms: {},
  shared: new SharedState({}),
  steps: [],
  controlTypes: {},
  providers: [],
  stepNames: {},
};

function claimedStep(taken: Readonly<Record<string, true>>, node: SequenceNode): Readonly<Record<string, true>> {
  if (node.name === undefined) return taken;
  claimName(node.name, taken);

  return { ...taken, [node.name]: true };
}

/** The root of a linear chain; `build()` freezes it into a `Stepper`. */
export class StepperBuilder<
  TForms = {},
  TKinds extends string = BuiltInControlKind,
  TCtx extends RuntimeStepContext = RootContext,
> {
  readonly __forms?: TForms;

  readonly __context?: TCtx;

  constructor(private readonly chain: ChainState = EMPTY_CHAIN) {}

  addControlType<K extends string, Cmp extends object>(
    kind: K & UnregisteredKind<TKinds, K>,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): StepperBuilder<TForms, TKinds | K, TCtx> {
    return new StepperBuilder<TForms, TKinds | K, TCtx>({
      ...this.chain,
      controlTypes: { ...this.chain.controlTypes, [kind]: component },
    });
  }

  overrideControlType<K extends TKinds, Cmp extends object>(
    kind: K,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): StepperBuilder<TForms, TKinds, TCtx> {
    return new StepperBuilder<TForms, TKinds, TCtx>({
      ...this.chain,
      controlTypes: { ...this.chain.controlTypes, [kind]: component },
    });
  }

  provide(...providers: Provider[]): StepperBuilder<TForms, TKinds, TCtx> {
    return new StepperBuilder<TForms, TKinds, TCtx>({
      ...this.chain,
      providers: [...this.chain.providers, ...providers],
    });
  }

  withState<S extends Record<string, unknown>>(initial: S): StepperBuilder<TForms, TKinds, WithShared<TCtx, S>> {
    return new StepperBuilder<TForms, TKinds, WithShared<TCtx, S>>({
      ...this.chain,
      shared: new SharedState({ ...this.chain.shared.snapshot(), ...initial }),
    });
  }

  createForm<K extends string, M extends Record<string, unknown>>(
    name: K,
    provider: FormProvider<M> & AnyFormProvider,
  ): StepperBuilder<TForms & Record<K, FormConfig<M>>, TKinds, TCtx> {
    claimName(name, this.chain.forms);

    return new StepperBuilder<TForms & Record<K, FormConfig<M>>, TKinds, TCtx>({
      ...this.chain,
      forms: { ...this.chain.forms, [name]: provider },
    });
  }

  createStep<
    N extends string = never,
    P = {},
    O extends StepOptions<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = StepOptions<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: StepBuild<TForms, TCtx, P>,
    opts?: O & { readonly name?: N },
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>> {
    return new StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>>(
      this.appended([stepNode({ pages: pagesOf(build), opts: opts ?? {} })]),
    );
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, TCtx, {}>) => { __added?: unknown }>,
  >(
    select: BranchSelect<TCtx, K>,
    branches: B,
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, BranchAdded<B>>> {
    const steps: SequenceNode[] = [];
    for (const key in branches) {
      const gate: StepGate = {
        when: (ctx: GateContext<TCtx>) => {
          const selected: string | null | undefined = select(ctx);

          return selected === key;
        },
      };
      branches[key](new BranchBuilder<TForms, TCtx, {}>((node) => steps.push(node), gate));
    }

    return new StepperBuilder<TForms, TKinds, WithSteps<TCtx, BranchAdded<B>>>(this.appended(steps));
  }

  fork<A extends ForkArms<TForms, TCtx>>(
    select: (ctx: GateContext<TCtx>) => string,
    arms: A,
  ): TerminalForkBuilder<TForms, TCtx, ArmResult<A>> {
    const built = Object.entries(arms).map(([key, arm]) => [key, arm(new ForkArmBuilder<TForms, TCtx>())] as const);
    const forms = built.reduce((pool, [, arm]) => ({ ...pool, ...arm.forms }), this.chain.forms);
    const sharedInit = built.reduce(
      (state, [, arm]) => ({ ...state, ...arm.shared.snapshot() }),
      this.chain.shared.snapshot(),
    );
    const steps = built.flatMap(([key, arm]) => {
      const gate: StepGate = { when: (ctx: GateContext<TCtx>) => select(ctx) === key };

      return arm.steps.map((node) => guardedBy(gate, node));
    });
    const resolvers: Readonly<Record<string, ForkArm>> = Object.fromEntries(built);
    const definition: FlowDefinition = {
      forms,
      steps: [...this.chain.steps, ...steps],
      shared: new SharedState(sharedInit),
      resolveResult: (ctx: GateContext<TCtx>) => resolvers[select(ctx)]?.resolve(ctx),
      controlTypes: this.chain.controlTypes,
      providers: this.chain.providers,
    };

    return { build: () => new Stepper<TForms, TCtx, ArmResult<A>>(definition) };
  }

  createStepper<N extends string, F2, TK2 extends string, TCtx2 extends RuntimeStepContext, O extends FlowStepOptions<TCtx>>(
    name: N,
    flow: O & LinearFlowStep<TKinds, TCtx, StepperBuilder<F2, TK2, TCtx2>>,
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepsCommitted<TCtx2['steps']>, O>>> {
    const built = flow.build(new StepperBuilder<{}, TKinds, ChildContext<TCtx>>()).build();

    return new StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepsCommitted<TCtx2['steps']>, O>>>(
      this.appended([flowStepNode({ name, flow: built, opts: flow })]),
    );
  }

  createRecurrentStepper<N extends string, C, F2, TCtx2 extends RingRuntimeContext<C>, O extends FlowStepOptions<TCtx>>(
    name: N,
    ring: O & RecurrentFlowStep<C, TKinds, TCtx, RecurrentTerminal<F2, TCtx2, C>>,
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, C, O>>> {
    const built = ring.build(new RecurrentStepperBuilder<{}, C, TKinds, RingContext<TCtx, C>>(ring)).build();

    return new StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, C, O>>>(
      this.appended([flowStepNode({ name, flow: built, opts: ring })]),
    );
  }

  build(): Stepper<TForms, TCtx, never> {
    return new Stepper<TForms, TCtx, never>({
      forms: this.chain.forms,
      steps: this.chain.steps,
      shared: new SharedState(this.chain.shared.snapshot()),
      controlTypes: this.chain.controlTypes,
      providers: this.chain.providers,
    });
  }

  private appended(nodes: readonly SequenceNode[]): ChainState {
    return {
      ...this.chain,
      steps: [...this.chain.steps, ...nodes],
      stepNames: nodes.reduce(claimedStep, this.chain.stepNames),
    };
  }
}

/** The runtime shape of every context inside a ring over `C`. */
export type RingRuntimeContext<C> = StepContext<
  SharedSignals,
  RuntimeStepContext['steps'],
  RuntimeStepContext['parent'],
  RecurrentSignals<C>
>;

/** A ring after `dock()`: only `build()` remains. */
export interface RecurrentTerminal<TForms, TCtx extends RuntimeStepContext, C> {
  build(): RecurrentStepper<TForms, TCtx, C>;
}

/** A built ring: the runtime shape plus the authoring types it was built with. */
export class RecurrentStepper<TForms = {}, TCtx extends RuntimeStepContext = RuntimeStepContext, C = unknown>
  implements RecurrentFlowDefinition<C>
{
  readonly __forms?: TForms;

  readonly __context?: TCtx;

  readonly recurrent: true = true;

  readonly steps: readonly SequenceNode[];

  readonly forms: Readonly<Record<string, AnyFormProvider>>;

  readonly shared: SharedState;

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  readonly dockAt: number;

  readonly initial: () => C;

  readonly fold?: (state: C, pass: RuntimeStepContext) => C;

  readonly dockReachable?: (state: C) => boolean;

  readonly complete?: (state: C) => boolean;

  readonly incompleteMessage?: string;

  constructor(definition: RecurrentFlowDefinition<C>) {
    this.steps = definition.steps;
    this.forms = definition.forms;
    this.shared = definition.shared;
    this.controlTypes = definition.controlTypes;
    this.providers = definition.providers;
    this.dockAt = definition.dockAt;
    this.initial = definition.initial;
    this.fold = definition.fold;
    this.dockReachable = definition.dockReachable;
    this.complete = definition.complete;
    this.incompleteMessage = definition.incompleteMessage;
  }
}

interface RingState<C> extends ChainState {
  readonly ring: RingCfg<C>;

  fold?(state: C, pass: RuntimeStepContext): C;

  complete?(state: C): boolean;

  readonly incompleteMessage?: string;
}

const passGate: StepGate = { when: (ctx) => ctx.flow?.passOpen() === true };

const dockGate: StepGate = { when: (ctx) => ctx.flow?.passOpen() !== true };

/** The root of a ring: pass steps, `fold`, `completeWhen`, then `dock` last. */
export class RecurrentStepperBuilder<
  TForms = {},
  C = unknown,
  TKinds extends string = BuiltInControlKind,
  TCtx extends RingRuntimeContext<C> = RingContext<RootContext, C>,
> {
  readonly __forms?: TForms;

  readonly __context?: TCtx;

  private readonly state: RingState<C>;

  private docked = false;

  constructor(ring: RingCfg<C> | RingState<C>) {
    this.state = 'steps' in ring ? ring : { ...EMPTY_CHAIN, ring };
  }

  provide(...providers: Provider[]): RecurrentStepperBuilder<TForms, C, TKinds, TCtx> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, TCtx>({
      ...this.state,
      providers: [...this.state.providers, ...providers],
    });
  }

  withState<S extends Record<string, unknown>>(
    initial: S,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithShared<TCtx, S>> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, WithShared<TCtx, S>>({
      ...this.state,
      shared: new SharedState({ ...this.state.shared.snapshot(), ...initial }),
    });
  }

  createForm<K extends string, M extends Record<string, unknown>>(
    name: K,
    provider: FormProvider<M> & AnyFormProvider,
  ): RecurrentStepperBuilder<TForms & Record<K, FormConfig<M>>, C, TKinds, TCtx> {
    claimName(name, this.state.forms);

    return new RecurrentStepperBuilder<TForms & Record<K, FormConfig<M>>, C, TKinds, TCtx>({
      ...this.state,
      forms: { ...this.state.forms, [name]: provider },
    });
  }

  addControlType<K extends string, Cmp extends object>(
    kind: K & UnregisteredKind<TKinds, K>,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): RecurrentStepperBuilder<TForms, C, TKinds | K, TCtx> {
    return new RecurrentStepperBuilder<TForms, C, TKinds | K, TCtx>({
      ...this.state,
      controlTypes: { ...this.state.controlTypes, [kind]: component },
    });
  }

  overrideControlType<K extends TKinds, Cmp extends object>(
    kind: K,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): RecurrentStepperBuilder<TForms, C, TKinds, TCtx> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, TCtx>({
      ...this.state,
      controlTypes: { ...this.state.controlTypes, [kind]: component },
    });
  }

  createStep<N extends string = never, P = {}>(
    build: StepBuild<TForms, TCtx, P>,
    opts: StepOptions<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = {},
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>>(
      this.appended([stepNode({ pages: pagesOf(build), opts, gate: passGate })]),
    );
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, TCtx, {}>) => { __added?: unknown }>,
  >(
    select: BranchSelect<TCtx, K>,
    branches: B,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, BranchAdded<B>>> {
    const steps: SequenceNode[] = [];
    for (const key in branches) {
      const gate: StepGate = {
        when: (ctx: GateContext<TCtx>) => {
          if (!passGate.when(ctx)) return false;

          const selected: string | null | undefined = select(ctx);

          return selected === key;
        },
      };
      branches[key](new BranchBuilder<TForms, TCtx, {}>((node) => steps.push(node), gate));
    }

    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, BranchAdded<B>>>(this.appended(steps));
  }

  createStepper<N extends string, F2, TK2 extends string, TCtx2 extends RuntimeStepContext, O extends FlowStepOptions<TCtx>>(
    name: N,
    flow: O & LinearFlowStep<TKinds, TCtx, StepperBuilder<F2, TK2, TCtx2>>,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepsCommitted<TCtx2['steps']>>>> {
    const built = flow.build(new StepperBuilder<{}, TKinds, ChildContext<TCtx>>()).build();

    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepsCommitted<TCtx2['steps']>>>>(
      this.appended([guardedBy(passGate, flowStepNode({ name, flow: built, opts: flow }))]),
    );
  }

  createRecurrentStepper<N extends string, C2, F2, TCtx2 extends RingRuntimeContext<C2>, O extends FlowStepOptions<TCtx>>(
    name: N,
    ring: O & RecurrentFlowStep<C2, TKinds, TCtx, RecurrentTerminal<F2, TCtx2, C2>>,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, C2>>> {
    const built = ring.build(new RecurrentStepperBuilder<{}, C2, TKinds, RingContext<TCtx, C2>>(ring)).build();

    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, C2>>>(
      this.appended([guardedBy(passGate, flowStepNode({ name, flow: built, opts: ring }))]),
    );
  }

  fold(fold: (state: C, pass: TCtx) => C): RecurrentStepperBuilder<TForms, C, TKinds, TCtx> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, TCtx>({ ...this.state, fold });
  }

  completeWhen(complete: (state: C) => boolean, message?: string): RecurrentStepperBuilder<TForms, C, TKinds, TCtx> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, TCtx>({
      ...this.state,
      complete,
      incompleteMessage: message,
    });
  }

  dock<N extends string = never, P = {}>(
    build: StepBuild<TForms, TCtx, P>,
    opts: StepOptions<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = {},
  ): RecurrentTerminal<TForms, TCtx, C> {
    if (this.docked) throw new Error('A recurrent flow has exactly one dock.');

    this.docked = true;
    const own = opts.completeWhen;
    const complete = this.state.complete;
    const gate = (ctx: GateContext<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>>): boolean => {
      if (own && !own(ctx)) return false;

      return complete ? complete(ctx.flow.state()) : true;
    };
    const docked = this.appended([
      stepNode({
        pages: pagesOf(build),
        opts: { ...opts, completeWhen: gate, incompleteMessage: opts.incompleteMessage ?? this.state.incompleteMessage },
        gate: dockGate,
      }),
    ]);
    const definition: RecurrentFlowDefinition<C> = {
      recurrent: true,
      steps: docked.steps,
      forms: docked.forms,
      shared: new SharedState(docked.shared.snapshot()),
      controlTypes: docked.controlTypes,
      providers: docked.providers,
      dockAt: this.state.steps.length,
      initial: this.state.ring.initial,
      fold: this.state.fold,
      dockReachable: this.state.ring.dockReachable,
      complete: this.state.complete,
      incompleteMessage: this.state.incompleteMessage,
    };

    return { build: () => new RecurrentStepper<TForms, TCtx, C>(definition) };
  }

  private appended(nodes: readonly SequenceNode[]): RingState<C> {
    return {
      ...this.state,
      steps: [...this.state.steps, ...nodes],
      stepNames: nodes.reduce(claimedStep, this.state.stepNames),
    };
  }
}
