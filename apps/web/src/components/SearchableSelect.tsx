import { useId, useMemo, useState, type KeyboardEvent } from 'react'

export type SearchableOption = {
  value: string
  label: string
}

type SearchableSelectProps = {
  value: string
  options: SearchableOption[]
  placeholder: string
  disabled?: boolean
  name?: string
  onChange: (value: string) => void
}

export function SearchableSelect({
  value,
  options,
  placeholder,
  disabled = false,
  name,
  onChange,
}: SearchableSelectProps) {
  const listId = useId()
  const selectedLabel = options.find((option) => option.value === value)?.label ?? ''
  const [searchTerm, setSearchTerm] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const query = searchTerm ?? selectedLabel

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const result = normalizedQuery
      ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
      : options
    return result.slice(0, 50)
  }, [options, query])

  const selectOption = (option: SearchableOption) => {
    setSearchTerm(null)
    onChange(option.value)
    setOpen(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => !open || filteredOptions.length === 0
        ? 0
        : Math.min(index + 1, filteredOptions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && open && filteredOptions[activeIndex]) {
      event.preventDefault()
      selectOption(filteredOptions[activeIndex])
    } else if (event.key === 'Escape') {
      setSearchTerm(null)
      setOpen(false)
    }
  }

  return (
    <div className="searchable-select">
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => { setSearchTerm(null); setOpen(false) }}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          setSearchTerm(event.target.value)
          setActiveIndex(0)
          onChange('')
          setOpen(true)
        }}
      />
      {name && <input type="hidden" name={name} value={value} />}
      {open && !disabled && (
        <div className="searchable-select-list" id={listId} role="listbox">
          {filteredOptions.map((option, index) => (
            <div
              className={`searchable-select-option${index === activeIndex ? ' is-active' : ''}`}
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => {
                event.preventDefault()
                selectOption(option)
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {option.label}
            </div>
          ))}
          {filteredOptions.length === 0 && <div className="searchable-select-empty">검색 결과가 없습니다.</div>}
          {filteredOptions.length === 50 && <div className="searchable-select-hint">검색어를 더 입력해 주세요.</div>}
        </div>
      )}
    </div>
  )
}
