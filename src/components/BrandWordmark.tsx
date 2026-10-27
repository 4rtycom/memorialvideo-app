type BrandWordmarkProps = {
  className?: string;
  /** Accessible name; defaults to memorialvideo */
  alt?: string;
  /** Kept for call-site compatibility; unused (text wordmark, not an image). */
  priority?: boolean;
};

/**
 * Same header wordmark as memorialvideo marketing SiteHeader / HomeNav:
 * lowercase “memorialvideo” with Cormorant and gold italic “video”.
 * Not a derived lettermark or reinterpreted PNG.
 */
export function BrandWordmark({
  className = 'brand-wordmark',
  alt = 'memorialvideo',
}: BrandWordmarkProps) {
  const name = 'memorialvideo';
  const tail = 'video';
  const lead = name.slice(0, -tail.length);

  return (
    <span className={className} aria-label={alt} role="img">
      <span className="brand-wordmark-lead">{lead}</span>
      <span className="brand-wordmark-tail">{tail}</span>
    </span>
  );
}
