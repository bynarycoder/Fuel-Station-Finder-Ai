import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `tailwind-merge`, taught about this project's CUSTOM type scale.
 *
 * WHY THIS EXISTS (a real bug this fixed):
 *
 * tailwind-merge resolves conflicts by class GROUP. Out of the box it knows
 * `text-sm`/`text-lg` are font sizes and anything else after `text-` is a
 * colour — so `text-body-sm`, `text-h3`, `text-caption` … were all filed
 * under `text-color`. In a `cn()` call like the Button's
 *
 *     "bg-slab text-slab-fg"  +  "h-11 rounded-md px-4 text-body-sm"
 *
 * the later `text-body-sm` was treated as a competing COLOUR and
 * `text-slab-fg` was dropped. Every sized button silently lost its
 * foreground colour and inherited body text instead: white-on-green became
 * near-black-on-green (2.1:1) in the browser, while the source looked
 * correct. The same trap swallowed `text-h3` whenever a colour followed it.
 *
 * Declaring the scale here makes the two groups distinct again, so a size and
 * a colour can coexist and only genuinely conflicting classes are merged.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "h1",
            "h2",
            "h3",
            "body",
            "body-sm",
            "caption",
            "label",
          ],
        },
      ],
    },
  },
});

/**
 * Merges class names safely using clsx and tailwind-merge.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
