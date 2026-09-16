/** A compile-time refusal whose property name states the reason. */
export type Rejected<Reason extends string> = { readonly 'ngx-formad': Reason };
