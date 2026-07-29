import type { TransactionCategoryItem } from "@/lib/api";

// Categories are a tree one level deep (category -> sub-category); a transaction's
// categoryId may point at either level, so lookups need to walk both.
export function findCategoryById(
  categories: TransactionCategoryItem[],
  id?: number | null,
): TransactionCategoryItem | undefined {
  if (id == null) return undefined;
  for (const c of categories) {
    if (c.id === id) return c;
    const sub = c.subCategories.find((s) => s.id === id);
    if (sub) return sub;
  }
  return undefined;
}

export function resolveCategorySelection(
  categories: TransactionCategoryItem[],
  categoryId?: number | null,
): { topId: string; subId: string } {
  if (categoryId == null) return { topId: "", subId: "" };
  for (const c of categories) {
    if (c.id === categoryId) return { topId: String(c.id), subId: "" };
    const sub = c.subCategories.find((s) => s.id === categoryId);
    if (sub) return { topId: String(c.id), subId: String(sub.id) };
  }
  return { topId: "", subId: "" };
}

// A categoryId's "effective" top-level id — itself if it's already top-level, else its parent's id.
// Used to match a transaction against a top-level Category filter regardless of which level it's tagged at.
export function topLevelIdFor(
  categories: TransactionCategoryItem[],
  categoryId?: number | null,
): number | null {
  if (categoryId == null) return null;
  for (const c of categories) {
    if (c.id === categoryId) return c.id;
    if (c.subCategories.some((s) => s.id === categoryId)) return c.id;
  }
  return null;
}

// Flattened options for a combined category+sub-category picker (e.g. the transaction table filter):
// top-level categories followed by their indented sub-categories.
export function buildFlattenedCategoryOptions(
  categories: TransactionCategoryItem[],
): { value: string; label: string }[] {
  return categories.flatMap((c) => [
    { value: String(c.id), label: c.name },
    ...c.subCategories.map((sub) => ({
      value: String(sub.id),
      label: `${c.name} › ${sub.name}`,
    })),
  ]);
}

// All sub-categories across every parent, for a dedicated Sub-Category filter — label qualified
// with the parent name since sub-category names aren't guaranteed unique across different parents.
export function buildSubCategoryOptions(
  categories: TransactionCategoryItem[],
): { value: string; label: string }[] {
  return categories.flatMap((c) =>
    c.subCategories.map((sub) => ({
      value: String(sub.id),
      label: `${c.name} › ${sub.name}`,
    })),
  );
}

// Same as buildSubCategoryOptions, but narrowed to only the children of the selected top-level
// Category filter values — so the Sub-Category dropdown stays relevant once a Category is picked.
// "uncategorized" is ignored (it has no children); with no real category selected, all
// sub-categories are shown, same as buildSubCategoryOptions.
export function buildSubCategoryOptionsForSelection(
  categories: TransactionCategoryItem[],
  selectedCategoryIds: string[],
): { value: string; label: string }[] {
  const ids = selectedCategoryIds.filter((v) => v !== "uncategorized");
  const relevant = ids.length > 0 ? categories.filter((c) => ids.includes(String(c.id))) : categories;
  return relevant.flatMap((c) =>
    c.subCategories.map((sub) => ({
      value: String(sub.id),
      label: `${c.name} › ${sub.name}`,
    })),
  );
}
