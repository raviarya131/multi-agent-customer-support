import { TypedBrand } from "./typed-brand";

/**
 * Large branding hero for the empty (left) half of the auth pages on desktop.
 * The auth card sits on the right, so this fills the left with an animated,
 * serif wordmark + tagline. Hidden below `lg` (the card shows its own compact
 * brand on small screens).
 */
export function AuthBrandHero() {
  return (
    <div className="absolute inset-y-0 left-0 z-10 hidden max-w-[46%] flex-col justify-center pl-[10vw] pr-8 lg:flex">
      <TypedBrand
        text="Support Engine"
        className="font-serif text-6xl font-semibold leading-[1.05] tracking-tight text-foreground"
      />
      <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
        Multi-agent support that resolves - with a human in the loop when it matters.
      </p>
    </div>
  );
}
