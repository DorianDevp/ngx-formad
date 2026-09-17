import { PlacesCustomFields } from '../../form';
import { SharedState } from '../../shared';
import {
  ArmState,
  BranchAdded,
  BranchSelect,
  DynamicStepCfg,
  ForkArm,
  Gated,
  GatedEntry,
  NotDynamic,
  StaticStepCfg,
  StepCfg,
  StepEntry,
  StepPages,
} from '../types/builder';
import { SequenceNode } from '../types/flow';
import {
  AnyFormProvider,
  ConfigOf,
  FormPlaced,
  FormUi,
  GateContext,
  RuntimeStepperContext,
  StepGate,
  StepInstance,
  WithShared,
  WithSteps,
} from '../types/step-context';
import { claimName, decidedOnce, DynamicStepBuild, pagesOf, StaticStepBuild, stepNode } from './step-builder';

type PushStep = (node: SequenceNode) => void;

/** Authors the steps of one branch; each is guarded by the branch condition. */
export class BranchBuilder<TForms, TCtx extends RuntimeStepperContext, TAdded = {}> {
  /**
   * Phantom: the step entries this arm adds to the context after the branch, each possibly absent. Inside the arm,
   * `TAdded` reads them as they are: an earlier step of the same arm is there whenever a later one is asked.
   * Carried by the type system, never read at runtime.
   */
  readonly __added?: Gated<TAdded>;

  constructor(
    private readonly push: PushStep,
    private readonly gate: StepGate,
  ) {}

  createStep<
    N extends string = never,
    P = {},
    O extends StaticStepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<P>>>, N> = StaticStepCfg<
      WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<P>>>,
      N
    >,
  >(
    build: StaticStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts?: O & { readonly name?: N },
  ): BranchBuilder<TForms, TCtx, TAdded & StepEntry<N, StepInstance<P>, O>>;
  createStep<
    N extends string = never,
    P = {},
    O extends DynamicStepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<P>>>, N> = DynamicStepCfg<
      WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<P>>>,
      N
    >,
  >(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: O & { readonly name?: N },
  ): BranchBuilder<TForms, TCtx, TAdded & StepEntry<N, StepInstance<P>, O>>;
  createStep(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, {}> & NotDynamic,
    opts?: StepCfg<WithSteps<TCtx, TAdded>, string>,
  ): never;
  createStep<
    N extends string = never,
    P = {},
    O extends StepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<P>>>, N> = {},
  >(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts?: O & { readonly name?: N },
  ): BranchBuilder<TForms, TCtx, TAdded & StepEntry<N, StepInstance<P>, O>> {
    this.push(stepNode({ pages: pagesOf(build, opts?.pages === StepPages.OnEntry), opts: opts ?? {}, gate: this.gate }));

    return new BranchBuilder<TForms, TCtx, TAdded & StepEntry<N, StepInstance<P>, O>>(this.push, this.gate);
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>) => { __added?: unknown }>,
  >(
    select: BranchSelect<WithSteps<TCtx, TAdded>, K>,
    branches: B,
  ): BranchBuilder<TForms, TCtx, TAdded & BranchAdded<B>> {
    const decide = decidedOnce(select);
    for (const key in branches) {
      const nested: StepGate = {
        activeWhen: (ctx: WithSteps<TCtx, TAdded>) => {
          if (!this.gate.activeWhen(ctx)) return false;

          const selected: string | null | undefined = decide(ctx);

          return selected === key;
        },
      };
      branches[key](new BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>(this.push, nested));
    }

    return new BranchBuilder<TForms, TCtx, TAdded & BranchAdded<B>>(this.push, this.gate);
  }
}

const EMPTY_ARM: ArmState = { forms: {}, shared: new SharedState({}), steps: [] };

/** Authors one fork arm: its own state, forms and steps, ending in `result`. */
export class ForkArmBuilder<TForms, TCtx extends RuntimeStepperContext, TAdded = {}> {
  constructor(private readonly arm: ArmState = EMPTY_ARM) {}

  withState<S extends Record<string, unknown>>(initial: S): ForkArmBuilder<TForms, WithShared<TCtx, S>, TAdded> {
    return new ForkArmBuilder<TForms, WithShared<TCtx, S>, TAdded>({
      ...this.arm,
      shared: new SharedState({ ...this.arm.shared.snapshot(), ...initial }),
    });
  }

  createForm<K extends string, F extends AnyFormProvider>(
    name: K,
    provider: F & PlacesCustomFields<FormUi<F>, FormPlaced<F>>,
  ): ForkArmBuilder<TForms & Record<K, ConfigOf<F>>, TCtx, TAdded> {
    claimName(name, this.arm.forms);

    return new ForkArmBuilder<TForms & Record<K, ConfigOf<F>>, TCtx, TAdded>({
      ...this.arm,
      forms: { ...this.arm.forms, [name]: provider },
    });
  }

  createStep<
    N extends string = never,
    P = {},
    O extends StaticStepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<P>>>, N> = StaticStepCfg<
      WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<P>>>,
      N
    >,
  >(
    build: StaticStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts?: O & { readonly name?: N },
  ): ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<P>>>;
  createStep<
    N extends string = never,
    P = {},
    O extends DynamicStepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<P>>>, N> = DynamicStepCfg<
      WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<P>>>,
      N
    >,
  >(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: O & { readonly name?: N },
  ): ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<P>>>;
  createStep(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, {}> & NotDynamic,
    opts?: StepCfg<WithSteps<TCtx, TAdded>, string>,
  ): never;
  createStep<N extends string = never, P = {}>(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: StepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<P>>>, N> = {},
  ): ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<P>>> {
    return new ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<P>>>({
      ...this.arm,
      steps: [...this.arm.steps, stepNode({ pages: pagesOf(build, opts.pages === StepPages.OnEntry), opts })],
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
    const decide = decidedOnce(select);
    for (const key in branches) {
      const gate: StepGate = {
        activeWhen: (ctx: WithSteps<TCtx, TAdded>) => {
          const selected: string | null | undefined = decide(ctx);

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
