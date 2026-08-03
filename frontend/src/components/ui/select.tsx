import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
};

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
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || options.length === 0) return;
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(highlightedIndex);
      else {
        setHighlightedIndex(selectedIndex);
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) => {
        const start = open ? current : selectedIndex;
        return (start + direction + options.length) % options.length;
      });
      setOpen(true);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(event.key === "Home" ? 0 : options.length - 1);
      setOpen(true);
    }
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
        aria-activedescendant={open ? `${listboxId}-${options[highlightedIndex]?.value}` : undefined}
        disabled={disabled}
        onClick={() => {
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
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listboxId}-${option.value}`}
              className={`select-option ${index === highlightedIndex ? "select-option-active" : ""}`}
              role="option"
              aria-selected={option.value === value}
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
