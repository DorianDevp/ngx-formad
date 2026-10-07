import { ControlKind, DockCfg, GatedEntry, NotDynamic, RecurrentTerminal, RingCfg, StepPages } from '../types/builder';
import { ChainState } from '../types/chain';
import { RecurrentFlowDefinition } from '../types/flow';
import { RingContext, RootContext, RuntimeStepperContext, StepGate, StepInstance, WithSteps } from '../types/step-context';
import { appended, definitionOf, EMPTY_CHAIN } from './chain';
import { FlowBuilder } from './flow-builder';
import { RecurrentStepper } from './recurrent-stepper';
import { DynamicStepBuild, guardedBy, pagesOf, StaticStepBuild, stepNode } from './step-builder';
import { StepperBuilder } from './stepper-builder';

/** A fold as the ring keeps it: a method, so one typed on the ring's own context fits without a cast. */
interface Folding<C> {
  fold(state: C, pass: RuntimeStepperContext): C;
}

const passGate: StepGate = { activeWhen: (ctx) => ctx.flow?.passOpen() === true };

const dockGate: StepGate = { activeWhen: (ctx) => ctx.flow?.passOpen() !== true };

/**
 * The ring: the same chain, authored as one pass, then `fold` and the terminal `dock`. Every pass step is gated on an
 * open pass and the dock on a closed one; the gates go on when the dock does, so the chain itself knows nothing of them.
 */
export class RecurrentStepperBuilder<
  TForms = {},
  C = unknown,
  TKinds extends string = ControlKind,
  TCtx extends RuntimeStepperContext = RingContext<RootContext, C>,
> extends FlowBuilder<TForms, TKinds, TCtx> {
  /** Phantom brand: what tells `Rebound` this chain is a ring, and over which accumulator. */
  declare readonly __ring: C;

  private docked = false;

  constructor(
    private readonly cfg: RingCfg<C>,
    chain: ChainState = EMPTY_CHAIN,
    private readonly folding?: Folding<C>,
  ) {
    super(chain);
  }

  protected override next(chain: ChainState): this {
    return new RecurrentStepperBuilder<TForms, C, TKinds, TCtx>(this.cfg, chain, this.folding) as this;
  }

  protected override linear<F, K extends string, Ctx extends RuntimeStepperContext>(): StepperBuilder<F, K, Ctx> {
    return new StepperBuilder<F, K, Ctx>();
  }

  protected override ring<C2, K extends string, P extends RuntimeStepperContext>(
    cfg: RingCfg<C2>,
  ): RecurrentStepperBuilder<{}, C2, K, RingContext<P, C2>> {
    return new RecurrentStepperBuilder<{}, C2, K, RingContext<P, C2>>(cfg);
  }

  fold(fold: (state: C, pass: TCtx) => C): this {
    return new RecurrentStepperBuilder<TForms, C, TKinds, TCtx>(this.cfg, this.chain, { fold }) as this;
  }

  dock<
    N extends string = never,
    P = {},
    O extends DockCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<P>>>, N> & { readonly pages?: StepPages.Once } = DockCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<P>>>,
      N
    > & { readonly pages?: StepPages.Once },
  >(build: StaticStepBuild<TForms, TCtx, P>, opts?: O & { readonly name?: N }): RecurrentTerminal<TForms, TCtx, C>;
  dock<
    N extends string = never,
    P = {},
    O extends DockCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<P>>>, N> & { readonly pages: StepPages.OnEntry } = DockCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<P>>>,
      N
    > & { readonly pages: StepPages.OnEntry },
  >(build: DynamicStepBuild<TForms, TCtx, P>, opts: O & { readonly name?: N }): RecurrentTerminal<TForms, TCtx, C>;
  dock(build: DynamicStepBuild<TForms, TCtx, {}> & NotDynamic, opts?: DockCfg<WithSteps<TCtx, {}>, string>): never;
  dock<N extends string = never, P = {}>(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts: DockCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<P>>>, N> = {},
  ): RecurrentTerminal<TForms, TCtx, C> {
    if (this.docked) throw new Error('A recurrent flow has exactly one dock.');
    this.docked = true;

    const passes = this.chain.steps.map((node) => guardedBy(passGate, node));
    const dock = stepNode({ pages: pagesOf(build, opts.pages === StepPages.OnEntry), opts, gate: dockGate });
    const docked = appended({ ...this.chain, steps: passes }, [dock]);

    const definition: RecurrentFlowDefinition<C> = {
      ...definitionOf(docked),
      recurrent: true,
      dockAt: passes.length,
      state: this.cfg.state,
      fold: this.folding?.fold,
      dockReachable: this.cfg.dockReachable,
    };

    return { define: () => definition, build: () => new RecurrentStepper<TForms, TCtx, C>(definition) };
  }
}
