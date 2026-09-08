import { Component, inject, Injectable, InjectionToken, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { provideFormadSuite } from '../provide';
import { FormadDockRestart } from './flow-dock';
import { StepPageView } from './step-page-view';
import { StepperController } from './stepper-controller';
import { StepperComponent } from './stepper.component';

async function settle(fixture: ComponentFixture<object>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

type One = { v: string };

const oneForm = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

const GREETING = new InjectionToken<string>('greeting');

@Injectable()
class FlowScoped {
  static alive = 0;

  constructor() {
    FlowScoped.alive = FlowScoped.alive + 1;
  }

  ngOnDestroy(): void {
    FlowScoped.alive = FlowScoped.alive - 1;
  }
}

@Component({
  selector: 'greeting-panel',
  template: `<span class="greeting">{{ greeting }}</span>`,
})
class GreetingPanel {
  readonly greeting = inject(GREETING);
}

@Component({
  selector: 'prov-dock',
  imports: [FormadDockRestart],
  template: `
    <span class="dock-greeting">{{ greeting }}</span>
    <button type="button" class="add" ngxFormadDockRestart>Add</button>
  `,
})
class ProvDock {
  readonly greeting = inject(GREETING);

  readonly count = input(0);
}

@Component({
  selector: 'prov-chrome',
  imports: [StepPageView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-page [step]="step" />
    }
    <button type="button" class="next" (click)="c.next()">Next</button>
  `,
})
class ProvChrome {
  readonly controller = input.required<StepperController>();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class ProvHost {
  whenSaw = '';

  readonly stepper =     new StepperBuilder()
      .provide({ provide: GREETING, useValue: 'from the root flow' }, FlowScoped)
      .withState({})
      .createForm('start', oneForm('Start'))
      .createStep(
        (s) =>
          s.createPage((p) =>
            p.addForm('start').addComponent(GreetingPanel, {}), { heading: 'Start' },
          ),
        {
          label: 'Start',
          when: () => {
            this.whenSaw = inject(GREETING);
            inject(FlowScoped);

            return true;
          },
        },
      )
      .createRecurrentStepper('items', {
        initial: (): string[] => [],
        label: 'Items',
        build: (loop) =>
          loop
            .provide({ provide: GREETING, useValue: 'from the ring' })
            .createForm('name', oneForm('Name'))
            .createStep(
              (s) => s.createPage((p) => p.addForm('name'), { heading: 'Name' }),
              { label: 'Name' },
            )
            .fold((state) => [...state, 'x'])
            .dock(
              (s, ctx) =>
                s.createPage((p) =>
                  p.addComponent(ProvDock, { inputs: { count: () => ctx.flow.state().length } }), { heading: 'Collected' },
                ),
              { label: 'Dock' },
            ),
      })
      .build();
}

describe('Flow providers - the wizard as its own injection environment', () => {
  let fixture: ComponentFixture<ProvHost>;

  const read = (selector: string) =>
    (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent.trim();
  const click = async (selector: string) => {
    (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
    await settle(fixture);
  };

  beforeEach(async () => {
    FlowScoped.alive = 0;
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: ProvChrome })] });
    fixture = TestBed.createComponent(ProvHost);
    await settle(fixture);
  });

  it('lets a step component inject what the flow declared, with no input wiring', () => {
    expect(read('.greeting')).toBe('from the root flow');
  });

  it('runs author callbacks in the flow context, so inject() works in them', () => {
    expect(fixture.componentInstance.whenSaw).toBe('from the root flow');
  });

  it('scopes a nested flow: its providers shadow the parent for its own steps', async () => {
    await click('.next');
    await click('.next');

    expect(read('.dock-greeting')).toBe('from the ring');
  });

  it('destroys the flow environments with the host', () => {
    expect(FlowScoped.alive).toBe(1);

    fixture.destroy();

    expect(FlowScoped.alive).toBe(0);
  });
});
