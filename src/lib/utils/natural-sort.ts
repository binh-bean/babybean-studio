/**
 * Natural ordering for photo file names.
 *
 * OWNER: DEV-FE (shared). Used by the Drive sync to assign sort_index.
 *
 * Photographers export as BB_1.jpg … BB_10.jpg. Lexicographic sorting puts
 * BB_10 before BB_2, which makes the customer's gallery order look scrambled
 * against the contact sheet the studio printed.
 */

const collator = new Intl.Collator("vi", {
  numeric: true,
  sensitivity: "base",
  ignorePunctuation: false,
});

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

export function naturalSort<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((x, y) => naturalCompare(key(x), key(y)));
}
