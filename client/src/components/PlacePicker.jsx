import { useEffect, useState } from 'react';

// A type-ahead field for the route card, so a start or end point can be typed
// instead of only picked from a list.
//
// It is a combobox rather than a plain <select>, but no choice was lost: focusing
// the field lists every point the app already knows about, which is what the old
// dropdown showed, and typing narrows that list while also searching OpenStreetMap
// for anything else.
//
// `options` are points already known to the app (reports, the shared location, a
// pin dropped on the map). `search` is called for anything else the admin types.
export default function PlacePicker({
  id,
  label,
  text,
  placeholder,
  options,
  search,
  onTextChange,
  onChoose
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState({ items: [], busy: false, failed: false });
  const listboxId = `${id}-listbox`;

  useEffect(() => {
    const query = text.trim();

    // Below three characters a search returns almost the whole country, and only
    // the open field searches at all, so typing in Start never fires requests for End.
    if (!open || query.length < 3) {
      setRemote({ items: [], busy: false, failed: false });
      return undefined;
    }

    const controller = new AbortController();
    setRemote(previous => ({ ...previous, busy: true }));

    // Debounced: Photon is a free shared service, so a request per keystroke would
    // be both slow and rude.
    const timer = setTimeout(() => {
      search(query, controller.signal)
        .then(items => setRemote({ items, busy: false, failed: false }))
        .catch(err => {
          if (err.name === 'AbortError') return;
          setRemote({ items: [], busy: false, failed: true });
        });
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, text, search]);

  const suggestions = open ? [...options, ...remote.items] : [];

  const choose = point => {
    onChoose(point);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) {
        setOpen(true);
        return;
      }

      if (suggestions.length === 0) return;

      event.preventDefault();
      setActive(current => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        if (next < 0) return suggestions.length - 1;
        if (next >= suggestions.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === 'Enter' && open && active >= 0 && suggestions[active]) {
      event.preventDefault();
      choose(suggestions[active]);
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const message = remote.busy
    ? 'Searching...'
    : remote.failed
      ? 'Place search is unavailable.'
      : 'No matching place.';

  return (
    <div className="ops-place">
      <label htmlFor={id}>{label}</label>

      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck="false"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
        placeholder={placeholder}
        value={text}
        onChange={event => {
          onTextChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        // Selecting the text on focus makes replacing a chosen point a single click
        // and a retype, instead of clearing the field first.
        onFocus={event => {
          event.target.select();
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />

      {open && (
        <ul className="ops-suggest" id={listboxId} role="listbox" aria-label={`${label} suggestions`}>
          {suggestions.map((point, index) => (
            <li key={point.key} role="option" aria-selected={index === active}>
              <button
                type="button"
                id={`${id}-option-${index}`}
                className={`ops-suggest-item ${index === active ? 'is-active' : ''}`}
                // Keeping the focus in the field is what stops the click landing on
                // nothing after a blur closes the list.
                onMouseDown={event => event.preventDefault()}
                onClick={() => choose(point)}
              >
                <span className="ops-suggest-label">{point.label}</span>
                {point.hint && <span className="ops-suggest-hint">{point.hint}</span>}
              </button>
            </li>
          ))}

          {suggestions.length === 0 && <li className="ops-suggest-empty">{message}</li>}
        </ul>
      )}

      {remote.busy && suggestions.length > 0 && <p className="ops-place-status">Searching...</p>}
    </div>
  );
}
