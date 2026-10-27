type BrandWordmarkProps = {
  className?: string;
  /** Accessible name; defaults to memorialvideo */
  alt?: string;
  priority?: boolean;
};

/** Canonical lowercase memorialvideo wordmark (dark ink on cream). */
export function BrandWordmark({
  className = 'brand-wordmark',
  alt = 'memorialvideo',
  priority = false,
}: BrandWordmarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset; next/image unoptimized globally
    <img
      src="/brand/memorialvideo-wordmark.png"
      alt={alt}
      width={221}
      height={49}
      className={className}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : {})}
    />
  );
}
