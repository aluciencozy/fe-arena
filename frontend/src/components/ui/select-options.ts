export type SelectOption = {
  value: string;
  label: string;
};

export const shouldContainEscape = (listboxOpen: boolean) => listboxOpen;

export function findTypeaheadOptionIndex(options: SelectOption[], query: string) {
  const normalizedQuery = query.toLowerCase();
  if (!normalizedQuery) return -1;
  return options.findIndex(
    (option) =>
      option.label.toLowerCase().startsWith(normalizedQuery) || option.value.toLowerCase().startsWith(normalizedQuery),
  );
}
