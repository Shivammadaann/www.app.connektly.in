import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export interface DropdownSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  ariaLabel?: string;
}

export function DropdownSelect({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  disabled = false,
  icon,
  className = '',
  buttonClassName = '',
  menuClassName = '',
  ariaLabel,
}: DropdownSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const enabledOptions = useMemo(() => options.filter((option) => !option.disabled), [options]);
  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);

  const getNextEnabledIndex = (currentIndex: number, direction: 1 | -1) => {
    if (enabledOptions.length === 0) {
      return -1;
    }

    const fallbackIndex = selectedIndex >= 0 && !options[selectedIndex]?.disabled
      ? selectedIndex
      : options.findIndex((option) => !option.disabled);
    let nextIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;

    for (let attempt = 0; attempt < options.length; attempt += 1) {
      nextIndex = (nextIndex + direction + options.length) % options.length;
      if (!options[nextIndex]?.disabled) {
        return nextIndex;
      }
    }

    return fallbackIndex;
  };

  const openMenu = (preferredIndex = selectedIndex) => {
    if (disabled) {
      return;
    }

    const nextIndex = preferredIndex >= 0 && !options[preferredIndex]?.disabled
      ? preferredIndex
      : options.findIndex((option) => !option.disabled);
    setHighlightedIndex(nextIndex);
    setIsOpen(true);
  };

  const selectOption = (option: DropdownSelectOption) => {
    if (option.disabled) {
      return;
    }

    onChange(option.value);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen && highlightedIndex >= 0) {
        selectOption(options[highlightedIndex]);
        return;
      }

      if (isOpen) {
        setIsOpen(false);
      } else {
        openMenu();
      }
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();

      if (!isOpen) {
        openMenu();
        return;
      }

      setHighlightedIndex((current) => getNextEnabledIndex(current, 1));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();

      if (!isOpen) {
        openMenu();
        return;
      }

      setHighlightedIndex((current) => getNextEnabledIndex(current, -1));
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
    }

    if (event.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen && highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }

          openMenu();
        }}
        onKeyDown={handleKeyDown}
        className={`flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left text-sm text-gray-900 shadow-[0_8px_24px_rgba(15,23,42,0.04)] outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50 hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)] focus:border-[#5b45ff] focus:ring-2 focus:ring-[#5b45ff]/15 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none disabled:hover:translate-y-0 ${buttonClassName}`}
      >
        {icon ? <span className="shrink-0 text-gray-400">{icon}</span> : null}
        <span className={`min-w-0 flex-1 truncate ${selectedOption ? '' : 'text-gray-400'}`}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            id={listboxId}
            role="listbox"
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            className={`absolute left-0 right-0 top-full z-50 mt-2 max-h-64 origin-top overflow-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.16)] ring-1 ring-black/5 ${menuClassName}`}
          >
            {options.map((option, optionIndex) => {
              const isSelected = option.value === value;
              const isHighlighted = optionIndex === highlightedIndex;

              return (
                <button
                  id={`${listboxId}-option-${optionIndex}`}
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onMouseEnter={() => setHighlightedIndex(optionIndex)}
                  onClick={() => selectOption(option)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-[#f1efff] font-semibold text-[#4a35e8]'
                      : isHighlighted
                        ? 'bg-gray-50 text-gray-950'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-950'
                  } disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
