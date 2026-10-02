// PRD Round 16, item 2: one level of sub-categories under a main category.
type CategoryLike = { id: number; name: string; parentId?: number | null };

/** Main categories in name order, each followed by its own sub-categories.
 * A sub-category whose main category isn't in the list (e.g. retired) is
 * still shown, at the end, so it never silently disappears. */
export function orderCategoriesAsTree<T extends CategoryLike>(categories: T[]): Array<T & { depth: 0 | 1 }> {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const mains = categories.filter((category) => !category.parentId).sort(byName);
  const mainIds = new Set(mains.map((category) => category.id));
  const ordered: Array<T & { depth: 0 | 1 }> = [];
  for (const main of mains) {
    ordered.push({ ...main, depth: 0 });
    for (const child of categories.filter((category) => category.parentId === main.id).sort(byName)) ordered.push({ ...child, depth: 1 });
  }
  for (const orphan of categories.filter((category) => category.parentId && !mainIds.has(category.parentId)).sort(byName)) ordered.push({ ...orphan, depth: 1 });
  return ordered;
}

/** A dropdown label that visibly nests a sub-category under its main one. */
export function categoryOptionLabel(category: { name: string; depth?: number }) {
  return category.depth ? `   ↳ ${category.name}` : category.name;
}

/** A main category's report scope includes all of its sub-categories. */
export function categoryScopeIds(categories: CategoryLike[], categoryId: number) {
  return new Set([categoryId, ...categories.filter((category) => category.parentId === categoryId).map((category) => category.id)]);
}
