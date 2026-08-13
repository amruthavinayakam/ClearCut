import { useEffect, useState } from "react";

import { api } from "../../api/client";
import Drawer from "../../components/Drawer";
import type { IntendedUseProfile } from "../../types";


interface Props {
  open: boolean;
  projectId: string;
  profile: IntendedUseProfile;
  onClose: () => void;
  onChanged: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export default function UseProfileSheet({ open, projectId, profile, onClose, onChanged, returnFocusRef }: Props) {
  const [media, setMedia] = useState(profile.media.join(", "));
  const [territories, setTerritories] = useState(profile.territories.join(", "));
  const [startsOn, setStartsOn] = useState(profile.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(profile.ends_on ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMedia(profile.media.join(", "));
    setTerritories(profile.territories.join(", "));
    setStartsOn(profile.starts_on ?? "");
    setEndsOn(profile.ends_on ?? "");
  }, [profile]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.updateUseProfile(projectId, {
        media: media.split(",").map((value) => value.trim()).filter(Boolean),
        territories: territories.split(",").map((value) => value.trim()).filter(Boolean),
        starts_on: startsOn || null,
        ends_on: endsOn || null,
      });
      onChanged();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The intended-use profile could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} title="Intended use" onClose={onClose} returnFocusRef={returnFocusRef}>
      <p className="sheet-intro">This profile is the comparison target for every recorded document. It does not change a legal status.</p>
      <form className="document-form" onSubmit={submit}>
        <label>
          Media
          <input required placeholder="theatrical, streaming" value={media} onChange={(event) => setMedia(event.target.value)} />
        </label>
        <label>
          Territories
          <input required placeholder="US, CA" value={territories} onChange={(event) => setTerritories(event.target.value)} />
        </label>
        <div className="form-pair">
          <label>
            Use begins
            <input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
          </label>
          <label>
            Use ends
            <input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
          </label>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button type="submit" className="button button--primary" disabled={busy}>{busy ? "Saving…" : "Save intended use"}</button>
      </form>
    </Drawer>
  );
}
