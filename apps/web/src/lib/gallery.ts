/**
 * Shared shapes for the photo galleries.
 *
 * Three places show photos: the main gallery on the home page, the gallery on
 * a past event's page, and the editors in the admin area. They all speak the
 * same shape so one grid component can render any of them.
 */

/** A photo as the public site sees it. */
export interface GalleryPhoto {
  id: string;
  url: string;
  caption: string | null;
  /** Set when the photo came from a session, so the viewer can link to it. */
  eventId?: string | null;
  eventName?: string | null;
  eventDate?: string | null;
  /** 'session' is a photo of the room and the team; 'repair' is of an item. */
  kind?: 'session' | 'repair';
}

/** A photo as an editor sees it, with who may see it and who added it. */
export interface ManagedPhoto extends GalleryPhoto {
  isPublished?: boolean;
  showOnHome?: boolean;
  sortOrder?: number;
  uploaderName?: string | null;
  isMine?: boolean;
  /** Repair photos carry the job they belong to, for context in the editor. */
  jobNumber?: string | null;
  categoryName?: string | null;
  stage?: string | null;
}
