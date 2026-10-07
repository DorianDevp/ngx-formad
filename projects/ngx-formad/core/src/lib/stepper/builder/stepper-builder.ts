import { Branch, BranchAdded, BranchSelect, ControlKind, ForkResult, RingCfg, StepsCommitted } from '../types/builder';
import { ChainState } from '../types/chain';
import { FlowDefinition } from '../types/flow';
import { AfterSteps, RingContext, RootContext, RuntimeStepperContext } from '../types/step-context';
import { definitionOf, egressOf, EMPTY_CHAIN, merged } from './chain';
import { ArmAuthor, FlowBuilder } from './flow-builder';
import { RecurrentStepperBuilder } from './recurrent-stepper-builder';
import { decidedOnce } from './step-builder';
import { Stepper } from './stepper';

/** The linear chain: the root of a stepper, an arm, a nested flow; `build()` freezes it, `fork()` splits it for good. */
export class StepperBuilder<
  TForms = {},
  TKinds extends string = ControlKind,
  TCtx extends RuntimeStepperContext = RootContext,
> extends FlowBuilder<TForms, TKinds, TCtx> {
  /** Phantom brand: what tells `Rebound` this chain is linear. */
  declare readonly __linear: true;

  constructor(chain: ChainState = EMPTY_CHAIN) {
    super(chain);
  }

  protected override next(chain: ChainState): this {
    return new StepperBuilder(chain) as this;
  }

  protected override linear<F, K extends string, C extends RuntimeStepperContext>(): StepperBuilder<F, K, C> {
    return new StepperBuilder<F, K, C>();
  }

  protected override ring<C, K extends string, P extends RuntimeStepperContext>(
    cfg: RingCfg<C>,
  ): RecurrentStepperBuilder<{}, C, K, RingContext<P, C>> {
    return new RecurrentStepperBuilder<{}, C, K, RingContext<P, C>>(cfg);
  }

  /**
   * Arms that do not rejoin: the selected arm's steps end the flow, and the flow's egress is that arm's egress under
   * its key - `{ a: Ea } | { b: Eb }`. An arm may itself fork; its union then sits under its key.
   */
  fork<A extends Record<string, ArmAuthor<TForms, TKinds, TCtx>>>(
    select: BranchSelect<TCtx, string>,
    arms: A,
  ): Branch<TForms, AfterSteps<TCtx, BranchAdded<A, TCtx>>, ForkResult<A>> {
    const decide = decidedOnce(select);
    const built = this.arms(arms);
    const chain = merged(this.chain, built, (key) => ({ activeWhen: (ctx: TCtx) => decide(ctx) === key }));
    const egress = Object.fromEntries(built.map(({ key, flow }) => [key, egressOf(flow)]));

    const definition: FlowDefinition<ForkResult<A>> = {
      ...definitionOf(chain),
      resolveResult: (ctx: TCtx, committed) => {
        const key = decide(ctx);
        const resolve = key == null ? undefined : egress[key];

        return resolve && ({ [key as string]: resolve(ctx, committed) } as unknown as ForkResult<A>);
      },
    };

    return {
      define: () => definition,
      build: () => new Stepper<TForms, AfterSteps<TCtx, BranchAdded<A, TCtx>>, ForkResult<A>>(definition),
    };
  }

  /** The flow as data, for the level that nests or flattens it; nothing is instantiated. */
  define(): FlowDefinition<StepsCommitted<TCtx['steps']>> {
    return definitionOf(this.chain);
  }

  /** The stepper with its forms built; call it in an injection context, which then owns them. */
  build(): Stepper<TForms, TCtx, StepsCommitted<TCtx['steps']>> {
    return new Stepper<TForms, TCtx, StepsCommitted<TCtx['steps']>>(this.define());
  }
}
