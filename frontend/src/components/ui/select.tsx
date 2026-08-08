import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { findTypeaheadOptionIndex, shouldContainEscape, type SelectOption } from "./select-options";

type SelectProps = {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  containerClassName?: string;
  buttonClassName?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
};

export function Select({
  id,
  value,
  options,
  onChange,
  disabled = false,
  containerClassName = "",
  buttonClassName = "",
  ariaLabel,
  ariaLabelledBy,
}: SelectProps) {
  const generatedId = useId();
  const triggerId = id ?? `select-${generatedId}`;
  const listboxId = `${triggerId}-options`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const typeaheadBufferRef = useRef("");
  const typeaheadTimeoutRef = useRef<number | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex] ?? options[0];

  const clearTypeahead = () => {
    typeaheadBufferRef.current = "";
    if (typeaheadTimeoutRef.current !== null) {
      window.clearTimeout(typeaheadTimeoutRef.current);
      typeaheadTimeoutRef.current = null;
    }
  };

  const scheduleTypeaheadClear = () => {
    if (typeaheadTimeoutRef.current !== null) window.clearTimeout(typeaheadTimeoutRef.current);
    typeaheadTimeoutRef.current = window.setTimeout(() => {
      typeaheadBufferRef.current = "";
      typeaheadTimeoutRef.current = null;
    }, 700);
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    return () => {
      if (typeaheadTimeoutRef.current !== null) window.clearTimeout(typeaheadTimeoutRef.current);
    };
  }, []);

  const choose = (index: number, keepOpen = false) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(keepOpen);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || options.length === 0) return;
    if (event.key === "Tab") {
      clearTypeahead();
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      if (!shouldContainEscape(open)) return;
      event.preventDefault();
      event.stopPropagation();
      clearTypeahead();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      clearTypeahead();
      if (open) choose(highlightedIndex);
      else {
        setHighlightedIndex(selectedIndex);
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      clearTypeahead();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const start = open ? highlightedIndex : selectedIndex;
      const nextIndex = (start + direction + options.length) % options.length;
      setHighlightedIndex(nextIndex);
      choose(nextIndex, true);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      clearTypeahead();
      const nextIndex = event.key === "Home" ? 0 : options.length - 1;
      setHighlightedIndex(nextIndex);
      choose(nextIndex, true);
      return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;

    const nextQuery = `${typeaheadBufferRef.current}${event.key}`;
    const bufferedIndex = findTypeaheadOptionIndex(options, nextQuery);
    const nextIndex = bufferedIndex !== -1 ? bufferedIndex : findTypeaheadOptionIndex(options, event.key);
    if (nextIndex === -1) return;
    event.preventDefault();
    typeaheadBufferRef.current = bufferedIndex !== -1 ? nextQuery : event.key;
    scheduleTypeaheadClear();
    setHighlightedIndex(nextIndex);
    choose(nextIndex, open);
  };

  return (
    <div ref={rootRef} className={`select-root ${containerClassName}`}>
      <button
        id={triggerId}
        type="button"
        role="combobox"
        className={`field select-trigger flex items-center justify-between gap-3 text-left ${buttonClassName}`}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-autocomplete="none"
        aria-activedescendant={open ? `${listboxId}-option-${highlightedIndex}` : undefined}
        disabled={disabled}
        onClick={() => {
          clearTypeahead();
          setHighlightedIndex(selectedIndex);
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? "Select an option"}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && options.length > 0 && (
        <div
          id={listboxId}
          className="select-menu"
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-activedescendant={`${listboxId}-option-${highlightedIndex}`}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listboxId}-option-${index}`}
              className={`select-option ${index === highlightedIndex ? "select-option-active" : ""}`}
              role="option"
              tabIndex={-1}
              aria-selected={option.value === value}
              aria-posinset={index + 1}
              aria-setsize={options.length}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
