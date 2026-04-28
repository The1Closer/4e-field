import type { InspectionPhotoDraft } from "@/types/inspection";

type Props = {
  photos: InspectionPhotoDraft[];
  onRemove: (id: string) => void;
  emptyText?: string;
};

export default function PhotoGrid({ photos, onRemove, emptyText = "No photos yet" }: Props) {
  if (photos.length === 0) return <p className="section-drawer__empty">{emptyText}</p>;
  return (
    <div className="section-drawer__photo-grid">
      {photos.map((photo) => {
        const url = URL.createObjectURL(photo.file);
        return (
          <div key={photo.id} className="section-drawer__photo-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="section-drawer__photo-img" />
            <button
              type="button"
              className="section-drawer__photo-remove"
              onClick={() => onRemove(photo.id)}
              aria-label="Remove photo"
            >
              ✕
            </button>
            {photo.slopeTag ? (
              <span className="section-drawer__photo-badge">{photo.slopeTag}</span>
            ) : null}
            {photo.damageCause && photo.damageCause !== "none" ? (
              <span className="section-drawer__photo-badge" style={{ bottom: 22 }}>
                {photo.damageCause}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
