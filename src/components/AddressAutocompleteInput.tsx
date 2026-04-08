"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";

type AddressPrediction = {
  description: string;
  placeId: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  apiKey: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  ariaLabel?: string;
  showStatus?: boolean;
  className?: string;
};

function parseError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AddressAutocompleteInput({
  value,
  onChange,
  apiKey,
  placeholder,
  required,
  disabled,
  name,
  id,
  ariaLabel,
  showStatus = false,
  className,
}: Props) {
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loadingPredictions, setLoadingPredictions] = useState(false);
  const [autocompleteError, setAutocompleteError] = useState<string | null>(null);
  const [autocompleteReady, setAutocompleteReady] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteServiceRef = useRef<any>(null);
  const requestIdRef = useRef(0);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    const initAutocomplete = async () => {
      if (!apiKey.trim()) {
        setAutocompleteError("Google address autofill unavailable: missing map API key.");
        setAutocompleteReady(false);
        return;
      }

      try {
        const maps = await loadGoogleMaps(apiKey);
        if (!active) return;

        if (typeof maps.importLibrary === "function") {
          try {
            await maps.importLibrary("places");
          } catch {
            // Continue and check namespace.
          }
        }

        if (!maps?.places?.AutocompleteService) {
          setAutocompleteError("Google address autofill unavailable. Enable Places API for this key.");
          setAutocompleteReady(false);
          return;
        }

        autocompleteServiceRef.current = new maps.places.AutocompleteService();
        setAutocompleteReady(true);
        setAutocompleteError(null);
      } catch (error) {
        if (!active) return;
        setAutocompleteReady(false);
        setAutocompleteError(parseError(error, "Google address autofill unavailable."));
      }
    };

    void initAutocomplete();

    return () => {
      active = false;
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
    };
  }, [apiKey]);

  useEffect(() => {
    if (disabled) {
      setPredictions([]);
      setActiveIndex(-1);
      setLoadingPredictions(false);
      return;
    }

    if (!autocompleteReady) {
      setPredictions([]);
      setActiveIndex(-1);
      setLoadingPredictions(false);
      return;
    }

    const query = value.trim();
    if (query.length < 3) {
      setPredictions([]);
      setActiveIndex(-1);
      setLoadingPredictions(false);
      return;
    }

    const service = autocompleteServiceRef.current;
    if (!service || typeof service.getPlacePredictions !== "function") {
      setPredictions([]);
      setActiveIndex(-1);
      setLoadingPredictions(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingPredictions(true);

    const timeoutId = window.setTimeout(() => {
      service.getPlacePredictions(
        {
          input: query,
          types: ["address"],
          componentRestrictions: { country: "us" },
        },
        (responsePredictions: any[] | null, status: string) => {
          if (requestId !== requestIdRef.current) return;
          setLoadingPredictions(false);

          if (status !== "OK" || !Array.isArray(responsePredictions)) {
            setPredictions([]);
            setActiveIndex(-1);
            return;
          }

          const nextPredictions = responsePredictions.slice(0, 6).map((prediction) => ({
            description: String(prediction.description ?? ""),
            placeId: String(prediction.place_id ?? ""),
          }));

          setPredictions(nextPredictions);
          setActiveIndex((previous) => {
            if (nextPredictions.length === 0) return -1;
            if (previous < 0) return 0;
            return Math.min(previous, nextPredictions.length - 1);
          });
        },
      );
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autocompleteReady, disabled, value]);

  function selectPrediction(prediction: AddressPrediction) {
    onChange(prediction.description);
    setMenuOpen(false);
    setActiveIndex(-1);
    setPredictions([]);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function handleBlur() {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
    blurTimeoutRef.current = setTimeout(() => {
      setMenuOpen(false);
    }, 120);
  }

  function handleFocus() {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    if (predictions.length > 0) {
      setMenuOpen(true);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!menuOpen || predictions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((previous) => (previous + 1 >= predictions.length ? 0 : previous + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((previous) => (previous - 1 < 0 ? predictions.length - 1 : previous - 1));
      return;
    }

    if (event.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < predictions.length) {
        event.preventDefault();
        selectPrediction(predictions[activeIndex]);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <>
      <div className="address-autocomplete-wrap">
        <input
          ref={inputRef}
          id={id}
          name={name}
          className={className}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setMenuOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          aria-label={ariaLabel}
        />

        {menuOpen && predictions.length > 0 ? (
          <div className="address-suggestion-menu" role="listbox" aria-label="Address suggestions">
            {predictions.map((prediction, index) => (
              <button
                key={`${prediction.placeId}-${index}`}
                type="button"
                className={
                  index === activeIndex
                    ? "address-suggestion-item address-suggestion-item-active"
                    : "address-suggestion-item"
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => selectPrediction(prediction)}
                role="option"
                aria-selected={index === activeIndex}
              >
                {prediction.description}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showStatus && loadingPredictions ? <p className="hint">Finding matching addresses...</p> : null}
      {showStatus && autocompleteError ? <p className="hint">{autocompleteError}</p> : null}
    </>
  );
}
