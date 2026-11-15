import { Branch, BranchAdded, BranchSelect, ControlKind, ForkResult, RingCfg, StepsCommitted } from '../types/builder';
import { ChainState } from '../types/chain';
import { FlowDefinition } from '../types/flow';
import { AfterSteps, RingContext, RootContext, RuntimeStepperContext } from '../types/step-context';
import { ExactTipMappers, ForkTips, TipMappers, TipResults, TipsCarrier } from '../types/tips';
import { definitionOf, egressOf, EMPTY_CHAIN, merged } from './chain';
import { ArmAuthor, FlowBuilder } from './flow-builder';
import { RecurrentStepperBuilder } from './recurrent-stepper-builder';
import { decidedOnce } from './step-builder';
import { Stepper } from './stepper';

/**
 * What `fork()` returns: a branch whose `build()` hands out the chosen arm's egress as before, or, given one mapper per
 * tip, what the tip the flow ended in maps to, under the tip's name.
 */
export interface ForkBranch<TForms, TCtx extends RuntimeStepperContext, A>
  extends Branch<TForms, TCtx, ForkResult<A>>,
    TipsCarrier<ForkTips<A>> {
  /**
   * The stepper with its forms built, handing out what each tip maps to: `{ [tip]?: R }`, the reached tip's key alone.
   * Every tip has its mapper; it reads the context the flow ended in, its walked steps as they were entered.
   */
  build<M extends TipMappers<ForkTips<A>>>(tips: ExactTipMappers<M, ForkTips<A>, A>): Stepper<TForms, TCtx, TipResults<M>>;

  /** The stepper with its forms built, handing out the chosen arm's egress under its key. */
  build(): Stepper<TForms, TCtx, ForkResult<A>>;
}

type RuntimeMappers = Readonly<Record<string, (ctx: RuntimeStepperContext) => unknown>>;

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
   * its key - `{ a: Ea } | { b: Eb }`. An arm may itself fork; its union then sits under its key. The arms that end the
   * flow are its tips, named across the nested forks; `build()` may map each to what the stepper hands out.
   */
  fork<A extends Record<string, ArmAuthor<TForms, TKinds, TCtx>>>(
    select: BranchSelect<TCtx, string>,
    arms: A,
  ): ForkBranch<TForms, AfterSteps<TCtx, BranchAdded<A, TCtx>>, A> {
    const decide = decidedOnce(select);
    const built = this.arms(arms);
    const chain = merged(this.chain, built, (key) => ({ activeWhen: (ctx: TCtx) => decide(ctx) === key }));
    const egress = Object.fromEntries(built.map(({ key, flow }) => [key, egressOf(flow)]));
    const nested = Object.fromEntries(built.map(({ key, flow }) => [key, flow]));

    const tips = built.flatMap(({ key, flow }) => flow.tips ?? [key]);
    const repeated = tips.find((tip, index) => tips.indexOf(tip) !== index);
    if (repeated !== undefined) {
      throw new Error(`ngx-formad: the tip '${repeated}' ends two arms; tips are named across nested forks, so name them apart.`);
    }

    const reachedTip = (ctx: RuntimeStepperContext): string | undefined => {
      const key = decide(ctx as TCtx);
      const arm = key == null ? undefined : nested[key];
      if (!arm) return undefined;

      return arm.reachedTip ? arm.reachedTip(ctx) : (key as string);
    };

    const definition: FlowDefinition<ForkResult<A>> = {
      ...definitionOf(chain),
      tips,
      reachedTip,
      resolveResult: (ctx: TCtx, committed) => {
        const key = decide(ctx);
        const resolve = key == null ? undefined : egress[key];

        return resolve && ({ [key as string]: resolve(ctx, committed) } as unknown as ForkResult<A>);
      },
    };

    const mapped = (mappers: RuntimeMappers): FlowDefinition => {
      const missing = tips.filter((tip) => typeof mappers[tip] !== 'function');
      if (missing.length) throw new Error(`ngx-formad: build() maps every tip of the fork; no mapper for: ${missing.join(', ')}.`);

      const strangers = Object.keys(mappers).filter((name) => !tips.includes(name));
      if (strangers.length) {
        throw new Error(`ngx-formad: ${strangers.join(', ')} is no tip of the fork; its tips are: ${tips.join(', ')}.`);
      }

      return {
        ...definition,
        resolveResult: (ctx, _committed, walked) => {
          const tip = reachedTip(ctx);

          return tip === undefined ? undefined : { [tip]: mappers[tip](walked ?? ctx) };
        },
      };
    };

    const branch = {
      define: () => definition,
      build: (mappers?: RuntimeMappers) => new Stepper(mappers ? mapped(mappers) : definition),
    };

    return branch as unknown as ForkBranch<TForms, AfterSteps<TCtx, BranchAdded<A, TCtx>>, A>;
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
