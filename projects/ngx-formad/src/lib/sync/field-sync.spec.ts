import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { commitToShared, seedFromShared } from './directional-sync';
import { fieldSync } from './field-sync';
import { SharedState } from './shared-state';

// Exercises the directional sync against a real `form()` — the end-to-end claim
// of the headline feature, not the engine in isolation (that lives in
// directional-sync.spec). `form()` needs an injection context, hence TestBed.
describe('fieldSync against a real form', () => {
  it('seeds a pristine field and writes back on commit', () => {
    TestBed.runInInjectionContext(() => {
      const model = signal({ email: '' });
      const root = form(model);
      const field = fieldSync(root.email);
      const shared = new SharedState({ email: 'from-step-1@example.com' });

      // Entry: pristine, so it picks up the shared value, and stays pristine.
      seedFromShared(field, shared.slot('email'));
      expect(root.email().value()).toBe('from-step-1@example.com');
      expect(root.email().dirty()).toBe(false);

      // A user edit flips dirty; a later entry must not clobber it.
      root.email().value.set('typed@example.com');
      root.email().markAsDirty();
      seedFromShared(field, shared.slot('email'));
      expect(root.email().value()).toBe('typed@example.com');

      // Commit writes the entered value back to shared.
      commitToShared(field, shared.slot('email'));
      expect(shared.get('email')).toBe('typed@example.com');
    });
  });
});
