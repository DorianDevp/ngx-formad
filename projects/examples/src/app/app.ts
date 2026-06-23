import { Component, computed, signal } from '@angular/core';
import { RuntimeStepper } from 'ngx-formad';
import { buildComplaintFlow, buildReturnFlow, buildWarrantyFlow } from './flows';
import { FlowKey, FlowTheme, THEMES } from './theme';
import { WizardHost } from './wizard-host';

// The example's shell: an app card that shows one of three screens — the landing
// chooser, a running wizard, or its success page. It owns no form logic itself;
// it only picks a flow, builds that flow's stepper once, and hands it to
// `WizardHost`. The active theme paints the chrome by setting the `--accent`
// custom properties the stylesheet reads, so the same markup re-skins per flow.
type View = 'landing' | 'wizard' | 'success';

const BUILDERS: Record<FlowKey, () => RuntimeStepper> = {
  return: buildReturnFlow,
  complaint: buildComplaintFlow,
  warranty: buildWarrantyFlow,
};

/** The landing chooser cards, in display order. */
const CARDS: readonly { key: FlowKey; tag: string; desc: string }[] = [
  {
    key: 'return',
    tag: 'Working product · send it back',
    desc: 'The item is fine — you ordered too many, changed your mind, or it is not the right fit.',
  },
  {
    key: 'complaint',
    tag: 'Damaged, wrong or incomplete',
    desc: 'Something arrived broken, the wrong item shipped, or parts are missing from your order.',
  },
  {
    key: 'warranty',
    tag: 'Product defect · under warranty',
    desc: 'Register a purchased product and report a defect you want covered by its warranty.',
  },
];

@Component({
  selector: 'app-root',
  imports: [WizardHost],
  template: `
    <div class="stage">
      <div class="app" [style]="accentVars()">
        <header class="app-header">
          <div class="logo">COMP<span class="logo-dot">A</span>NY</div>
          <button class="header-btn" type="button"><i class="ti ti-user"></i> Sign in</button>
        </header>

        <div class="body">
          @switch (view()) {
            @case ('landing') {
              <div class="scroll">
                <div class="content landing">
                  <span class="eyebrow">Self-service</span>
                  <h1 class="pg-title">How can we help?</h1>
                  <p class="pg-sub">Pick the kind of request — we will guide you the right way.</p>

                  <div class="cards">
                    @for (card of cards; track card.key) {
                      <button
                        class="card"
                        type="button"
                        [style]="cardVars(card.key)"
                        (click)="start(card.key)"
                      >
                        <span class="card-icon"><i class="ti" [class]="theme(card.key).icon"></i></span>
                        <span class="card-body">
                          <span class="card-title">{{ theme(card.key).label }}</span>
                          <span class="card-tag">{{ card.tag }}</span>
                          <span class="card-desc">{{ card.desc }}</span>
                        </span>
                        <i class="ti ti-arrow-right card-go"></i>
                      </button>
                    }
                  </div>
                </div>
              </div>
            }

            @case ('wizard') {
              <app-wizard
                [stepper]="stepper()!"
                [theme]="active()!"
                (finished)="view.set('success')"
                (exited)="reset()"
              />
            }

            @case ('success') {
              <div class="scroll">
                <div class="content success">
                  <div class="success-icon"><i class="ti ti-circle-check"></i></div>
                  <h2>{{ active()!.doneTitle }}</h2>
                  <p>{{ active()!.successText }}</p>
                  <div class="ticket">
                    <span>Reference</span>
                    <strong>{{ active()!.ticket }}</strong>
                  </div>
                  <button class="btn btn-accent" type="button" (click)="reset()">
                    <i class="ti ti-home"></i> Back to start
                  </button>
                </div>
              </div>
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class App {
  protected readonly cards = CARDS;
  protected readonly view = signal<View>('landing');
  protected readonly active = signal<FlowTheme | null>(null);
  protected readonly stepper = signal<RuntimeStepper | null>(null);

  protected theme(key: FlowKey): FlowTheme {
    return THEMES[key];
  }

  // The chrome reads only `--accent*`; setting them per flow re-skins everything.
  protected readonly accentVars = computed(() => this.toVars(this.active()));

  protected cardVars(key: FlowKey): Record<string, string> {
    return this.toVars(THEMES[key]);
  }

  private toVars(t: FlowTheme | null): Record<string, string> {
    if (!t) return {};
    return {
      '--accent': t.accent,
      '--accent-dark': t.accentDark,
      '--accent-light': t.accentLight,
    };
  }

  protected start(key: FlowKey): void {
    this.active.set(THEMES[key]);
    this.stepper.set(BUILDERS[key]());
    this.view.set('wizard');
  }

  protected reset(): void {
    this.view.set('landing');
    this.active.set(null);
    this.stepper.set(null);
  }
}
