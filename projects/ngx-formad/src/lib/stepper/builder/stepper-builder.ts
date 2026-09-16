import { isSignal, Provider, signal, Type } from '@angular/core';
import { ControlTypeMap } from '../../controls';
import { PlacesCustomFields } from '../../form';
import { SharedState } from '../../shared';
import {
  BranchAdded,
  BranchSelect,
  ControlComponent,
  ControlKind,
  DockCfg,
  DynamicStepCfg,
  FlowSlotCfg,
  ForkArm,
  GatedEntry,
  NotDynamic,
  RingCfg,
  RingRuntimeContext,
  StaticStepCfg,
  StepCfg,
  StepEntry,
  StepPages,
  StepsCommitted,
  UnregisteredKind,
} from '../types/builder';
import { FlowDefinition, FlowStepNode, RecurrentFlowDefinition, RuntimeFlow, SequenceNode } from '../types/flow';
import { SequenceNodeKind } from '../types/nodes';
import {
  AnyFormProvider,
  ChildContext,
  ConfigOf,
  FormPlaced,
  FormUi,
  GateContext,
  RingContext,
  RootContext,
  RuntimeStepperContext,
  StepGate,
  StepInstance,
  WithShared,
  WithSteps,
} from '../types/step-context';
import { BranchBuilder, ForkArmBuilder } from './branch-builder';
import {
  claimName,
  decidedOnce,
  DynamicStepBuild,
  guardedBy,
  pagesOf,
  StaticStepBuild,
  stepNode,
} from './step-builder';

/** The egress shape of a built stepper, for narrowing `stepCommitted` once at the boundary. */
export type CommittedOf<S> =
  S extends Stepper<infer _F, infer TCtx, infer _R> ? StepsCommitted<TCtx['steps']> : never;

/** A forked chain: nothing may follow, only `build()`. */
export interface TerminalForkBuilder<TForms, TCtx extends RuntimeStepperContext, TResult> {
  build(): Stepper<TForms, TCtx, TResult>;
}

type ForkArms<TForms, TCtx extends RuntimeStepperContext> = Record<
  string,
  (arm: ForkArmBuilder<TForms, TCtx>) => ForkArm
>;

type ArmResult<A> = {
  [P in keyof A]: A[P] extends (arm: never) => ForkArm<infer R> ? R : never;
}[keyof A];

/** A built linear flow: the runtime shape plus the authoring types it was built with. */
export class Stepper<TForms = {}, TCtx extends RuntimeStepperContext = RuntimeStepperContext, TResult = unknown>
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

/** A nested linear flow: slot options plus the callback authoring the sub-flow. */
export type LinearFlowStep<TKinds extends string, TCtx extends RuntimeStepperContext, TBuilt> = FlowSlotCfg<TCtx> & {
  readonly build: (sub: StepperBuilder<{}, TKinds, ChildContext<TCtx>>) => TBuilt;
};

/** A nested ring: slot options, its accumulator and the callback authoring the ring, ending in `dock`. */
export type RecurrentFlowStep<C, TKinds extends string, TCtx extends RuntimeStepperContext, TTerminal> = FlowSlotCfg<TCtx> &
  RingCfg<C> & {
    readonly build: (loop: RecurrentStepperBuilder<{}, C, TKinds, RingContext<TCtx, C>>) => TTerminal;
  };

interface FlowSlot<TCtx extends RuntimeStepperContext> {
  readonly name: string;

  readonly flow: RuntimeFlow;

  readonly opts: FlowSlotCfg<TCtx>;
}

function flowStepNode<TCtx extends RuntimeStepperContext>(slot: FlowSlot<TCtx>): FlowStepNode {
  return {
    kind: SequenceNodeKind.Flow,
    name: slot.name,
    flow: slot.flow,
    ...(slot.opts.label === undefined ? {} : { label: isSignal(slot.opts.label) ? slot.opts.label : signal(slot.opts.label) }),
    activeWhen: slot.opts.activeWhen,
    defer: slot.opts.defer,
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

function claimedForm(
  taken: Readonly<Record<string, AnyFormProvider>>,
  [name, provider]: readonly [string, AnyFormProvider],
): Readonly<Record<string, AnyFormProvider>> {
  claimName(name, taken);

  return { ...taken, [name]: provider };
}

/** The root of a linear chain; `build()` freezes it into a `Stepper`. */
export class StepperBuilder<
  TForms = {},
  TKinds extends string = ControlKind,
  TCtx extends RuntimeStepperContext = RootContext,
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

  createForm<K extends string, F extends AnyFormProvider>(
    name: K,
    provider: F & PlacesCustomFields<FormUi<F>, FormPlaced<F>>,
  ): StepperBuilder<TForms & Record<K, ConfigOf<F>>, TKinds, TCtx> {
    claimName(name, this.chain.forms);

    return new StepperBuilder<TForms & Record<K, ConfigOf<F>>, TKinds, TCtx>({
      ...this.chain,
      forms: { ...this.chain.forms, [name]: provider },
    });
  }

  createStep<
    N extends string = never,
    P = {},
    O extends StaticStepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = StaticStepCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: StaticStepBuild<TForms, TCtx, P>,
    opts?: O & { readonly name?: N },
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>>;
  createStep<
    N extends string = never,
    P = {},
    O extends DynamicStepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = DynamicStepCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts: O & { readonly name?: N },
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>>;
  createStep(build: DynamicStepBuild<TForms, TCtx, {}> & NotDynamic, opts?: StepCfg<TCtx, string>): never;
  createStep<N extends string = never, P = {}, O extends StepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = {}>(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts?: O & { readonly name?: N },
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>> {
    return new StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>>(
      this.appended([stepNode({ pages: pagesOf(build, opts?.pages === StepPages.OnEntry), opts: opts ?? {} })]),
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
    const decide = decidedOnce(select);
    for (const key in branches) {
      const gate: StepGate = {
        activeWhen: (ctx: TCtx) => {
          const selected: string | null | undefined = decide(ctx);

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
    const merged = built.reduce<ChainState>((chain, [key, arm]) => {
      const gate: StepGate = { activeWhen: (ctx: GateContext<TCtx>) => select(ctx) === key };
      const steps = arm.steps.map((node) => guardedBy(gate, node));

      return {
        ...chain,
        forms: Object.entries(arm.forms).reduce(claimedForm, chain.forms),
        shared: new SharedState({ ...chain.shared.snapshot(), ...arm.shared.snapshot() }),
        steps: [...chain.steps, ...steps],
        stepNames: steps.reduce(claimedStep, chain.stepNames),
      };
    }, this.chain);
    const resolvers: Readonly<Record<string, ForkArm>> = Object.fromEntries(built);
    const definition: FlowDefinition = {
      forms: merged.forms,
      steps: merged.steps,
      shared: new SharedState(merged.shared.snapshot()),
      resolveResult: (ctx: GateContext<TCtx>) => resolvers[select(ctx)]?.resolve(ctx),
      controlTypes: merged.controlTypes,
      providers: merged.providers,
    };

    return { build: () => new Stepper<TForms, TCtx, ArmResult<A>>(definition) };
  }

  createStepper<N extends string, F2, TK2 extends string, TCtx2 extends RuntimeStepperContext, O extends FlowSlotCfg<TCtx>>(
    name: N,
    flow: O & LinearFlowStep<TKinds, TCtx, StepperBuilder<F2, TK2, TCtx2>>,
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepsCommitted<TCtx2['steps']>, O>>> {
    const built = flow.build(new StepperBuilder<{}, TKinds, ChildContext<TCtx>>()).build();

    return new StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepsCommitted<TCtx2['steps']>, O>>>(
      this.appended([flowStepNode({ name, flow: built, opts: flow })]),
    );
  }

  createRecurrentStepper<N extends string, C, F2, TCtx2 extends RingRuntimeContext<C>, O extends FlowSlotCfg<TCtx>>(
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

/** A ring after `dock()`: only `build()` remains. */
export interface RecurrentTerminal<TForms, TCtx extends RuntimeStepperContext, C> {
  build(): RecurrentStepper<TForms, TCtx, C>;
}

/** A built ring: the runtime shape plus the authoring types it was built with. */
export class RecurrentStepper<TForms = {}, TCtx extends RuntimeStepperContext = RuntimeStepperContext, C = unknown>
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

  readonly state: () => C;

  readonly fold?: (state: C, pass: RuntimeStepperContext) => C;

  readonly dockReachable?: (state: C) => boolean;

  constructor(definition: RecurrentFlowDefinition<C>) {
    this.steps = definition.steps;
    this.forms = definition.forms;
    this.shared = definition.shared;
    this.controlTypes = definition.controlTypes;
    this.providers = definition.providers;
    this.dockAt = definition.dockAt;
    this.state = definition.state;
    this.fold = definition.fold;
    this.dockReachable = definition.dockReachable;
  }
}

interface RingState<C> extends ChainState {
  readonly ring: RingCfg<C>;

  fold?(state: C, pass: RuntimeStepperContext): C;
}

const passGate: StepGate = { activeWhen: (ctx) => ctx.flow?.passOpen() === true };

const dockGate: StepGate = { activeWhen: (ctx) => ctx.flow?.passOpen() !== true };

/** The root of a ring: pass steps, `fold`, `completeWhen`, then `dock` last. */
export class RecurrentStepperBuilder<
  TForms = {},
  C = unknown,
  TKinds extends string = ControlKind,
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

  createForm<K extends string, F extends AnyFormProvider>(
    name: K,
    provider: F & PlacesCustomFields<FormUi<F>, FormPlaced<F>>,
  ): RecurrentStepperBuilder<TForms & Record<K, ConfigOf<F>>, C, TKinds, TCtx> {
    claimName(name, this.state.forms);

    return new RecurrentStepperBuilder<TForms & Record<K, ConfigOf<F>>, C, TKinds, TCtx>({
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

  createStep<
    N extends string = never,
    P = {},
    O extends StaticStepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = StaticStepCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: StaticStepBuild<TForms, TCtx, P>,
    opts?: O & { readonly name?: N },
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>>;
  createStep<
    N extends string = never,
    P = {},
    O extends DynamicStepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = DynamicStepCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts: O & { readonly name?: N },
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>>;
  createStep(build: DynamicStepBuild<TForms, TCtx, {}> & NotDynamic, opts?: StepCfg<WithSteps<TCtx, {}>, string>): never;
  createStep<N extends string = never, P = {}>(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts: StepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = {},
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>>(
      this.appended([stepNode({ pages: pagesOf(build, opts.pages === StepPages.OnEntry), opts, gate: passGate })]),
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
    const decide = decidedOnce(select);
    for (const key in branches) {
      const gate: StepGate = {
        activeWhen: (ctx: TCtx) => {
          if (!passGate.activeWhen(ctx)) return false;

          const selected: string | null | undefined = decide(ctx);

          return selected === key;
        },
      };
      branches[key](new BranchBuilder<TForms, TCtx, {}>((node) => steps.push(node), gate));
    }

    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, BranchAdded<B>>>(this.appended(steps));
  }

  createStepper<N extends string, F2, TK2 extends string, TCtx2 extends RuntimeStepperContext, O extends FlowSlotCfg<TCtx>>(
    name: N,
    flow: O & LinearFlowStep<TKinds, TCtx, StepperBuilder<F2, TK2, TCtx2>>,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepsCommitted<TCtx2['steps']>>>> {
    const built = flow.build(new StepperBuilder<{}, TKinds, ChildContext<TCtx>>()).build();

    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepsCommitted<TCtx2['steps']>>>>(
      this.appended([guardedBy(passGate, flowStepNode({ name, flow: built, opts: flow }))]),
    );
  }

  createRecurrentStepper<N extends string, C2, F2, TCtx2 extends RingRuntimeContext<C2>, O extends FlowSlotCfg<TCtx>>(
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

  dock<
    N extends string = never,
    P = {},
    O extends DockCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> & { readonly pages?: StepPages.Once } = DockCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    > & { readonly pages?: StepPages.Once },
  >(build: StaticStepBuild<TForms, TCtx, P>, opts?: O & { readonly name?: N }): RecurrentTerminal<TForms, TCtx, C>;
  dock<
    N extends string = never,
    P = {},
    O extends DockCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> & { readonly pages: StepPages.OnEntry } = DockCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    > & { readonly pages: StepPages.OnEntry },
  >(build: DynamicStepBuild<TForms, TCtx, P>, opts: O & { readonly name?: N }): RecurrentTerminal<TForms, TCtx, C>;
  dock(build: DynamicStepBuild<TForms, TCtx, {}> & NotDynamic, opts?: DockCfg<WithSteps<TCtx, {}>, string>): never;
  dock<N extends string = never, P = {}>(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts: DockCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = {},
  ): RecurrentTerminal<TForms, TCtx, C> {
    if (this.docked) throw new Error('A recurrent flow has exactly one dock.');

    this.docked = true;
    const docked = this.appended([
      stepNode({ pages: pagesOf(build, opts.pages === StepPages.OnEntry), opts, gate: dockGate }),
    ]);
    const definition: RecurrentFlowDefinition<C> = {
      recurrent: true,
      steps: docked.steps,
      forms: docked.forms,
      shared: new SharedState(docked.shared.snapshot()),
      controlTypes: docked.controlTypes,
      providers: docked.providers,
      dockAt: this.state.steps.length,
      state: this.state.ring.state,
      fold: this.state.fold,
      dockReachable: this.state.ring.dockReachable,
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
