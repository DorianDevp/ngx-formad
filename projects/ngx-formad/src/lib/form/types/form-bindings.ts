import { Binding, Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { ControlNodes, CustomControlNodes } from 'formodel';
import { InputKeys, InputVal, ModelKeys, ModelVal, OutputKeys, OutputVal, Rejected } from '../../types';
import { FormContext } from './form-context';

/** Control kind → the component class the registry draws it with; augment it so the bindings of a registry-rendered field are typed. */
export interface ControlComponents {}

/** A reactive effect over a live form, run as an Angular `effect()` for as long as the instance lives. */
export type FormEffect<Ctx> = (ctx: Ctx) => void;

/** An effect as the runtime holds it; a method, so an effect typed on a richer context fits. */
export interface FormEffectHook {
  run(ctx: FormContext): void;
}

type Managed = keyof FormValueControl<never> & string;

/** The members `FormField` binds itself, and the change outputs of its two-way ones; a field binding may not touch them. */
type FormFieldManaged = Managed | `${Managed}Change`;

/** The static inputs a field's component takes beyond what `FormField` binds; a reactive one is a `Binding`. */
export type FieldInputs<C> = { readonly [K in Exclude<InputKeys<C>, FormFieldManaged>]?: InputVal<C, K> };

/** The output handlers a field's component takes: its emitters and the change outputs of its own model signals. */
export type FieldOutputs<C, Ctx> = {
  readonly [K in Exclude<OutputKeys<C>, FormFieldManaged>]?: (payload: OutputVal<C, K>, ctx: Ctx) => void;
} & {
  readonly [K in ModelKeys<C> & string as Exclude<`${K}Change`, FormFieldManaged>]?: (
    payload: ModelVal<C, K>,
    ctx: Ctx,
  ) => void;
};

/**
 * What one field's component is bound with: its static inputs and its output handlers, each keyed by the component's
 * own names, plus Angular's own bindings for anything reactive - `bindings: [inputBinding('options', theSignal)]`.
 */
export interface FieldBindings<C, Ctx> {
  readonly inputs?: FieldInputs<C>;

  readonly outputs?: FieldOutputs<C, Ctx>;

  readonly bindings?: readonly Binding[];
}

/** Every node type formodel knows a kind for: the built-ins with their overrides, and the application's custom kinds. */
type NodeRegistry = ControlNodes & CustomControlNodes;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The kind whose registered node type is exactly `N`; a `type: string` custom node is found this way. */
type KindByNode<N> = {
  [K in keyof NodeRegistry]: Same<N, NodeRegistry[K]> extends true ? K : never;
}[keyof NodeRegistry];

/** The kind a node names in its literal `type`; a literal node authored by hand is found this way. */
type KindByType<N> = N extends { readonly type: infer T extends string } ? (string extends T ? never : T) : never;

/** The kind of a field's node, member by member for a union: by its registered node type, or by its literal `type`. */
type KindOf<N> = N extends unknown ? KindByNode<N> | KindByType<N> : never;

type ComponentOfKind<K> = K extends keyof ControlComponents
  ? ControlComponents[K] extends Type<infer C>
    ? C
    : never
  : never;

type NodeOf<U, K> = K extends keyof U ? U[K] : never;

type IsUnion<T, U = T> = [T] extends [never] ? false : T extends unknown ? ([U] extends [T] ? false : true) : never;

/** One field's bindings by its node, or a refusal naming the fix: an unknown kind, a kind that is not exact, a kind without a component. */
type FieldBindingsOf<U, K extends string, Ctx> =
  KindOf<NodeOf<U, K>> extends infer Kind
    ? [Kind] extends [never]
      ? Rejected<`the kind of field "${K}" is unknown: author its node from a registered kind, or place it with control()`>
      : IsUnion<Kind> extends true
        ? Rejected<`the kind of field "${K}" is not exact: author \`ui\` as a literal and keep the config in defineForm()`>
        : [ComponentOfKind<Kind>] extends [never]
          ? Rejected<`no component is registered in ControlComponents for the kind "${Kind & string}" of field "${K}"`>
          : FieldBindings<ComponentOfKind<Kind>, Ctx>
    : never;

type GroupModel<T> = T extends Record<string, unknown> ? T : never;

type ItemModel<T> = T extends readonly (infer I)[] ? (I extends Record<string, unknown> ? I : never) : never;

/**
 * The bindings of one form, keyed by its field names: a field placed by `control()` binds by the component the layout
 * named, any other by the component `ControlComponents` registers for its kind; a group nests its record, a repeating
 * group binds every item's fields alike.
 */
export type FormBindings<M, U, P, Ctx> = {
  readonly [K in keyof M & string]?: K extends keyof P
    ? FieldBindings<P[K], Ctx>
    : NodeOf<U, K> extends { readonly controlsConfig: infer CU }
      ? FormBindings<GroupModel<M[K]>, CU, {}, Ctx>
      : NodeOf<U, K> extends { readonly itemConfig: infer IU }
        ? FormBindings<ItemModel<M[K]>, IU, {}, Ctx>
        : FieldBindingsOf<U, K, Ctx>;
};

/** A bindings record as the runtime holds it, erased; the mount reads a field's `inputs` and `outputs` by its path. */
export type BindingRecord = Readonly<Record<string, unknown>>;
