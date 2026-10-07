import { text, UiFormConfigBuilder } from 'formodel';
import { FormConfig } from '../../form';
import { SharedSignals } from '../../shared';
import { StepPages } from '../types/builder';
import { RingContext, RuntimeStepperContext } from '../types/step-context';
import { RecurrentStepperBuilder } from './recurrent-stepper-builder';

// A fragment authored over a parent context it does not know yet keeps that context generic. The entries its arms add
// must still reach the steps after the branch: the type is the guard, so these lines fail to compile the day they don't.

type One = { v: string };
const oneForm = (): FormConfig<One> => ({ model: () => ({ v: '' }), ui: UiFormConfigBuilder.from({ v: '' }).v(text('V')) });

type Parent = RuntimeStepperContext & { readonly shared: SharedSignals<{ src: 'a' | 'b' }> };

function author<TKinds extends string, TParent extends Parent>(
  loop: RecurrentStepperBuilder<{}, string[], TKinds, RingContext<TParent, string[]>>,
) {
  return loop
    .createForm('f', oneForm())
    .createStep((s) => s.createPage((p) => p.addForm('f')), { name: 'source' })
    .branch((c) => c.shared.src(), {
      a: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('f')), { name: 'plain' }),
      b: (arm) =>
        arm
          .createStep((s, _ctx) => s.createPage((p) => p.addForm('f')), { name: 'dyn', pages: StepPages.OnEntry })
          .createStep((s) => s.createPage((p) => p.addForm('f')), { name: 'gated', activeWhen: () => true }),
    })
    .fold((state, ctx) => [
      ...state,
      ctx.steps.plain?.f.model().v ?? '',
      ctx.steps.dyn?.f.model().v ?? '',
      ctx.steps.gated?.f.model().v ?? '',
    ]);
}

describe('A branch inside a fragment generic in its parent', () => {
  it('hands every arm’s entries to the steps after it', () => {
    expect(typeof author).toBe('function');
  });
});
