export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,8 92,80 50,60" fill="#a64f35" />
      <polygon points="50,8 50,60 8,80" fill="#c99a3c" />
      <polygon points="8,80 50,60 92,80" fill="#246d62" />
      <polygon points="8,80 50,60 92,80 50,92" fill="#1b564d" opacity="0.35" />
    </svg>
  );
}
