type GoogleMapsNamespace = any;

let mapsPromise: Promise<GoogleMapsNamespace> | null = null;

export async function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") {
    throw new Error("Google Maps can only load in the browser.");
  }

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  }

  const w = window as Window & {
    google?: {
      maps?: GoogleMapsNamespace;
    };
  };

  if (w.google?.maps) {
    return w.google.maps;
  }

  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      let settled = false;
      const callbackName = "__onGoogleMapsLoaded";
      const callbackHost = window as unknown as Record<string, unknown>;

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        try {
          delete callbackHost[callbackName];
        } catch {
          // no-op: cleanup best effort
        }
        mapsPromise = null;
        reject(new Error(message));
      };
      const done = (maps: GoogleMapsNamespace) => {
        if (settled) return;
        settled = true;
        try {
          delete callbackHost[callbackName];
        } catch {
          // no-op: cleanup best effort
        }
        resolve(maps);
      };

      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-google-maps="true"]',
      );

      const onReady = () => {
        if (w.google?.maps) {
          done(w.google.maps);
        } else {
          fail(
            "Google Maps failed to initialize. Check API key, referrer restrictions, and enabled APIs.",
          );
        }
      };

      const timeoutId = window.setTimeout(() => {
        fail(
          "Google Maps initialization timed out. Check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and Google Cloud restrictions.",
        );
      }, 15000);

      callbackHost[callbackName] = () => {
        window.clearTimeout(timeoutId);
        onReady();
      };

      if (existing) {
        if (w.google?.maps) {
          window.clearTimeout(timeoutId);
          done(w.google.maps);
          return;
        }

        const existingState = existing.getAttribute("data-google-maps-state");
        if (existingState === "error") {
          window.clearTimeout(timeoutId);
          fail("Google Maps script previously failed to load.");
          return;
        }

        existing.addEventListener("load", onReady, { once: true });
        existing.addEventListener(
          "error",
          () => {
            window.clearTimeout(timeoutId);
            fail("Google Maps script failed to load.");
          },
          { once: true },
        );
        // If script was injected before this loader runs, poll briefly for maps init.
        window.setTimeout(() => {
          const loaded = existing.getAttribute("data-google-maps-state") === "loaded";
          if (loaded && !w.google?.maps) {
            let attempts = 0;
            const pollId = window.setInterval(() => {
              attempts += 1;
              if (w.google?.maps) {
                window.clearInterval(pollId);
                window.clearTimeout(timeoutId);
                done(w.google.maps);
                return;
              }
              if (attempts >= 20) {
                window.clearInterval(pollId);
                window.clearTimeout(timeoutId);
                fail(
                  "Google Maps script loaded but API is unavailable. Verify Maps JavaScript API is enabled and key restrictions allow this origin.",
                );
              }
            }, 250);
          }
        }, 800);
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey,
      )}&v=weekly&callback=${encodeURIComponent(callbackName)}`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMaps = "true";
      script.setAttribute("data-google-maps-state", "loading");
      script.onload = () => {
        script.setAttribute("data-google-maps-state", "loaded");
        // Callback handles final readiness; keep onload as compatibility no-op.
        if (w.google?.maps) {
          window.clearTimeout(timeoutId);
          done(w.google.maps);
        }
      };
      script.onerror = () => {
        script.setAttribute("data-google-maps-state", "error");
        window.clearTimeout(timeoutId);
        fail("Google Maps script failed to load.");
      };
      document.head.appendChild(script);
    });
  }

  return mapsPromise;
}
