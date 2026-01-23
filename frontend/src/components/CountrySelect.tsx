import {useEffect, useMemo, useRef, useState} from 'react';

type Country = {name: string; code: string}; // ISO 3166-1 alpha-2

export default function CountrySelect({
  value,
  onChange,
  required,
  label = 'Nationality',
  placeholder = 'Select country…',
  allowClear = false,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Country[]>([]);
  const box = useRef<HTMLDivElement>(null);

  // fetch once (name + ISO code)
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const r = await fetch(
          'https://restcountries.com/v3.1/all?fields=name,cca2',
        );
        const json = await r.json();
        if (stop) return;
        const list: Country[] = json
          .map((c: any) => ({
            name: c.name?.common as string,
            code: c.cca2 as string,
          }))
          .filter((c: Country) => c.name && c.code)
          .sort((a, b) => a.name.localeCompare(b.name));
        setItems(list);
      } catch {
        // tiny offline fallback
        setItems([
          {name: 'India', code: 'IN'},
          {name: 'Italy', code: 'IT'},
          {name: 'Spain', code: 'ES'},
          {name: 'France', code: 'FR'},
          {name: 'Germany', code: 'DE'},
          {name: 'United States', code: 'US'},
          {name: 'United Kingdom', code: 'GB'},
        ]);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  // close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return items;
    return items.filter(c => c.name.toLowerCase().includes(n));
  }, [q, items]);

  const pick = (c: Country) => {
    onChange(c.name);
    setOpen(false);
    setQ('');
  };

  const selected = items.find(i => i.name === value) || null;

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQ('');
    setOpen(false);
  };

  return (
    <div ref={box} className="relative group">
      {label && (
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 block">
          {label}
          {required ? ' *' : ''}
        </label>
      )}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full text-left p-2.5 pr-9 border border-gray-300 dark:border-gray-700 rounded-lg flex items-center gap-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 relative"
      >
        {selected ? (
          <>
            <img
              src={`https://flagcdn.com/24x18/${selected.code.toLowerCase()}.png`}
              width={24}
              height={18}
              alt=""
              className="rounded-sm"
            />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-gray-500">{placeholder}</span>
        )}
      </button>

      {allowClear && value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear country"
          title="Clear"
          className={`absolute right-2.5 w-5 h-5 flex items-center justify-center rounded-full border border-gray-200 bg-white dark:bg-gray-700 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs z-10 ${
            label
              ? 'top-[calc(50%+12px)] -translate-y-1/2'
              : 'top-1/2 -translate-y-1/2'
          }`}
        >
          ×
        </button>
      )}

      {required && (
        // hidden input to satisfy native required validation
        <input
          tabIndex={-1}
          className="opacity-0 w-0 h-0 absolute"
          required
          value={value}
          onChange={() => {}}
        />
      )}

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-xl max-h-60 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              autoFocus
              placeholder="Search…"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md p-2 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="overflow-auto flex-1 max-h-60">
            {filtered.map(c => (
              <button
                type="button"
                key={c.code}
                onClick={() => pick(c)}
                className="w-full text-left flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0"
              >
                <img
                  src={`https://flagcdn.com/24x18/${c.code.toLowerCase()}.png`}
                  width={24}
                  height={18}
                  alt=""
                  className="rounded-sm"
                />
                <span className="text-sm">{c.name}</span>
              </button>
            ))}
            {!filtered.length && (
              <div className="p-3 text-gray-500 text-center text-sm">
                No matches
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
