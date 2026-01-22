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
    <div ref={box} style={{position: 'relative'}}>
      <label style={{fontSize: 12, display: 'block'}}>
        {label}
        {required ? ' *' : ''}
      </label>

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '8px 36px 8px 10px',
          border: '1px solid #ccc',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'white',
          position: 'relative',
        }}
      >
        {selected ? (
          <>
            <img
              src={`https://flagcdn.com/24x18/${selected.code.toLowerCase()}.png`}
              width={24}
              height={18}
              alt=""
              style={{display: 'inline-block', borderRadius: 2}}
            />
            <span>{selected.name}</span>
          </>
        ) : (
          <span style={{color: '#888'}}>{placeholder}</span>
        )}
      </button>

      {allowClear && value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear country"
          title="Clear"
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 18,
            height: 18,
            lineHeight: '18px',
            textAlign: 'center',
            borderRadius: '50%',
            border: '1px solid #ddd',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          ×
        </button>
      )}

      {required && (
        // hidden input to satisfy native required validation
        <input
          tabIndex={-1}
          style={{opacity: 0, width: 0, height: 0, position: 'absolute'}}
          required
          value={value}
          onChange={() => {}}
        />
      )}

      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            border: '1px solid #ddd',
            borderRadius: 8,
            background: 'white',
            boxShadow: '0 8px 20px rgba(0,0,0,.08)',
          }}
        >
          <div style={{padding: 8, borderBottom: '1px solid #eee'}}>
            <input
              autoFocus
              placeholder="Search…"
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: '6px 8px',
              }}
            />
          </div>
          <div style={{maxHeight: 260, overflow: 'auto'}}>
            {filtered.map(c => (
              <button
                type="button"
                key={c.code}
                onClick={() => pick(c)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  background: 'white',
                  border: 'none',
                  borderBottom: '1px solid #f6f6f6',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={`https://flagcdn.com/24x18/${c.code.toLowerCase()}.png`}
                  width={24}
                  height={18}
                  alt=""
                  style={{display: 'inline-block', borderRadius: 2}}
                />
                <span>{c.name}</span>
              </button>
            ))}
            {!filtered.length && (
              <div style={{padding: 12, color: '#777'}}>No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
