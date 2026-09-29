import { Provider, Type } from '@angular/core';
import { PlacesCustomFields } from '../../form';
import { SharedState, StateOf } from '../../shared';
import {
  AnyBranch,
  BranchAdded,
  BranchSelect,
  BuilderShape,
  ContextOf,
  ControlComponent,
  ControlKind,
  DynamicStepCfg,
  Egress,
  FlowSlotCfg,
  FormsOf,
  GatedEntry,
  KindsOf,
  NotDynamic,
  RecurrentTerminal,
  RingCfg,
  StaticStepCfg,
  StepCfg,
  StepEntry,
  StepPages,
  UnregisteredKind,
} from '../types/builder';
import { Arm, ChainState } from '../types/chain';
import {
  AfterSteps,
  AnyFormProvider,
  ChildContext,
  ConfigOf,
  FormPlaced,
  FormUi,
  RingContext,
  RootContext,
  RuntimeStepperContext,
  StepInstance,
  WithShared,
  WithSteps,
} from '../types/step-context';
import { appended, claimName, merged } from './chain';
import type { RecurrentStepperBuilder } from './recurrent-stepper-builder';
import { decidedOnce, DynamicStepBuild, flowStepNode, pagesOf, StaticStepBuild, stepNode } from './step-builder';
import type { StepperBuilder } from './stepper-builder';

// The types below name the concrete builders, so they live here rather than in `types/`: a fragment or an arm callback
// is written against a builder, and `Rebound` is what every chain method returns.

/**
 * The builder a chain method hands back, of the same kind as the one it was called on: a ring stays a ring, a linear
 * chain stays linear, the plain chain stays plain. `this` at the call site decides; a fragment typed on `FlowBuilder`
 * therefore returns the plain chain, and `use` rebinds it to the caller's kind.
 */
export type Rebound<Self, TForms, TKinds extends string, TCtx extends RuntimeStepperContext> = Self extends {
  readonly __ring: infer C;
}
  ? RecurrentStepperBuilder<TForms, C, TKinds, TCtx>
  : Self extends { readonly __linear: true }
    ? StepperBuilder<TForms, TKinds, TCtx>
    : FlowBuilder<TForms, TKinds, TCtx>;

/** A fragment: authored against the plain chain, applied through `use`, which keeps the caller's kind. */
export type Fragment<TForms, TKinds extends string, TCtx extends RuntimeStepperContext, R extends AnyFlowBuilder> = (
  builder: FlowBuilder<TForms, TKinds, TCtx>,
) => R;

/** Authors one arm of a `branch` or a `fork` over a fresh linear chain that reads this level's context. */
export type ArmAuthor<TForms, TKinds extends string, TCtx extends RuntimeStepperContext> = (
  arm: StepperBuilder<TForms, TKinds, TCtx>,
) => AnyBranch;

/** A nested linear flow: slot options plus the callback authoring the sub-flow, which may end in a fork. */
export type LinearFlowStep<TKinds extends string, TCtx extends RuntimeStepperContext, B extends AnyBranch> = FlowSlotCfg<TCtx> & {
  readonly build: (sub: StepperBuilder<{}, TKinds, ChildContext<TCtx>>) => B;
};

/** A nested ring: slot options, its accumulator and the callback authoring the ring, ending in `dock`. */
export type RecurrentFlowStep<C, TKinds extends string, TCtx extends RuntimeStepperContext> = FlowSlotCfg<TCtx> &
  RingCfg<C> & {
    readonly build: (
      loop: RecurrentStepperBuilder<{}, C, TKinds, RingContext<TCtx, C>>,
    ) => RecurrentTerminal<unknown, RuntimeStepperContext, C>;
  };

type AnyFlowBuilder = FlowBuilder<unknown, string, RuntimeStepperContext>;

/**
 * The chain every builder shares: pool, shared seed, control kinds, providers, steps, arms and nested flows. What ends
 * a chain is its kind's business: `build` and `fork` on the linear chain, `fold` and `dock` on the ring. A kind says
 * how to continue itself (`next`) and how to start the builders it hands to callbacks (`linear`, `ring`).
 */
export abstract class FlowBuilder<
  TForms = {},
  TKinds extends string = ControlKind,
  TCtx extends RuntimeStepperContext = RootContext,
> implements BuilderShape<TForms, TKinds, TCtx>
{
  readonly __forms?: TForms;

  readonly __kinds?: TKinds;

  readonly __context?: TCtx;

  protected constructor(protected readonly chain: ChainState) {}

  /** The same kind of builder over the next chain. */
  protected abstract next(chain: ChainState): this;

  /** A fresh linear chain, for an arm or a nested flow. */
  protected abstract linear<F, K extends string, C extends RuntimeStepperContext>(): StepperBuilder<F, K, C>;

  /** A fresh ring, for a nested ring. */
  protected abstract ring<C, K extends string, P extends RuntimeStepperContext>(
    cfg: RingCfg<C>,
  ): RecurrentStepperBuilder<{}, C, K, RingContext<P, C>>;

  private rebound<F, K extends string, C extends RuntimeStepperContext>(chain: ChainState): Rebound<this, F, K, C> {
    return this.next(chain) as unknown as Rebound<this, F, K, C>;
  }

  /** Every arm authored and built. */
  protected arms(authors: Readonly<Record<string, ArmAuthor<TForms, TKinds, TCtx>>>): readonly Arm[] {
    return Object.entries(authors).map(([key, author]) => ({
      key,
      flow: author(this.linear<TForms, TKinds, TCtx>()).build(),
    }));
  }

  provide(...providers: Provider[]): Rebound<this, TForms, TKinds, TCtx> {
    return this.rebound({ ...this.chain, providers: [...this.chain.providers, ...providers] });
  }

  withState<S extends Record<string, unknown>>(seeds: S): Rebound<this, TForms, TKinds, WithShared<TCtx, StateOf<S>>> {
    return this.rebound({
      ...this.chain,
      shared: new SharedState({ ...this.chain.shared.seeds(), ...seeds }),
    });
  }

  createForm<K extends string, F extends AnyFormProvider>(
    name: K,
    provider: F & PlacesCustomFields<FormUi<F>, FormPlaced<F>>,
  ): Rebound<this, TForms & Record<K, ConfigOf<F>>, TKinds, TCtx> {
    claimName(name, this.chain.forms);

    return this.rebound({ ...this.chain, forms: { ...this.chain.forms, [name]: provider } });
  }

  addControlType<K extends string, Cmp extends object>(
    kind: K & UnregisteredKind<TKinds, K>,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): Rebound<this, TForms, TKinds | K, TCtx> {
    return this.rebound({ ...this.chain, controlTypes: { ...this.chain.controlTypes, [kind]: component } });
  }

  overrideControlType<K extends TKinds, Cmp extends object>(
    kind: K,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): Rebound<this, TForms, TKinds, TCtx> {
    return this.rebound({ ...this.chain, controlTypes: { ...this.chain.controlTypes, [kind]: component } });
  }

  createStep<
    N extends string = never,
    P = {},
    O extends StaticStepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<P>>>, N> = StaticStepCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<P>>>,
      N
    >,
  >(
    build: StaticStepBuild<TForms, TCtx, P>,
    opts?: O & { readonly name?: N },
  ): Rebound<this, TForms, TKinds, AfterSteps<TCtx, StepEntry<N, StepInstance<P>, O>>>;
  createStep<
    N extends string = never,
    P = {},
    O extends DynamicStepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<P>>>, N> = DynamicStepCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<P>>>,
      N
    >,
  >(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts: O & { readonly name?: N },
  ): Rebound<this, TForms, TKinds, AfterSteps<TCtx, StepEntry<N, StepInstance<P>, O>>>;
  createStep(build: DynamicStepBuild<TForms, TCtx, {}> & NotDynamic, opts?: StepCfg<TCtx, string>): never;
  createStep<N extends string = never, P = {}, O extends StepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<P>>>, N> = {}>(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts?: O & { readonly name?: N },
  ): Rebound<this, TForms, TKinds, AfterSteps<TCtx, StepEntry<N, StepInstance<P>, O>>> {
    return this.rebound(
      appended(this.chain, [stepNode({ pages: pagesOf(build, opts?.pages === StepPages.OnEntry), opts: opts ?? {} })]),
    );
  }

  /**
   * Arms that rejoin: the selected arm's steps run, then the chain continues, reading every arm's entries as possibly
   * absent. Each arm is a linear chain over this level's context; its pool and state merge into this level's.
   */
  branch<K extends string, A extends Record<K, ArmAuthor<TForms, TKinds, TCtx>>>(
    select: BranchSelect<TCtx, K>,
    arms: A,
  ): Rebound<this, TForms, TKinds, AfterSteps<TCtx, BranchAdded<A, TCtx>>> {
    const decide = decidedOnce(select);
    const built = this.arms(arms);

    for (const arm of built) {
      if (arm.flow.resolveResult) {
        throw new Error(`ngx-formad: the arm '${arm.key}' forks, and a fork cannot rejoin; fork at this level instead.`);
      }
    }

    return this.rebound(merged(this.chain, built, (key) => ({ activeWhen: (ctx: TCtx) => decide(ctx) === key })));
  }

  createStepper<N extends string, B extends AnyBranch, O extends FlowSlotCfg<TCtx>>(
    name: N,
    flow: O & LinearFlowStep<TKinds, TCtx, B>,
  ): Rebound<this, TForms, TKinds, AfterSteps<TCtx, StepEntry<N, Egress<B>, O>>> {
    const built = flow.build(this.linear<{}, TKinds, ChildContext<TCtx>>()).build();

    return this.rebound(appended(this.chain, [flowStepNode({ name, flow: built, opts: flow })]));
  }

  createRecurrentStepper<N extends string, C, O extends FlowSlotCfg<TCtx>>(
    name: N,
    ring: O & RecurrentFlowStep<C, TKinds, TCtx>,
  ): Rebound<this, TForms, TKinds, AfterSteps<TCtx, StepEntry<N, C, O>>> {
    const built = ring.build(this.ring<C, TKinds, TCtx>(ring)).build();

    return this.rebound(appended(this.chain, [flowStepNode({ name, flow: built, opts: ring })]));
  }

  /** Applies a fragment authored against the plain chain and keeps this builder's kind. */
  use<R extends AnyFlowBuilder>(fragment: Fragment<TForms, TKinds, TCtx, R>): Rebound<this, FormsOf<R>, KindsOf<R>, ContextOf<R>> {
    return fragment(this) as unknown as Rebound<this, FormsOf<R>, KindsOf<R>, ContextOf<R>>;
  }
}
