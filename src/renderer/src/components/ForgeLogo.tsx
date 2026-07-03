export function ForgeHexagonMark({ size = 28 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      className="forge-hexagon-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M28.1 17.25 Q32 15 35.9 17.25 L42.83 21.25 Q46.72 23.5 46.72 28 L46.72 36 Q46.72 40.5 42.83 42.75 L35.9 46.75 Q32 49 28.1 46.75 L21.17 42.75 Q17.28 40.5 17.28 36 L17.28 28 Q17.28 23.5 21.17 21.25 Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function ForgeAppLogo({ size = 68 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      className="forge-app-logo"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="4" width="56" height="56" rx="15" fill="#050505" />
      <path
        d="M28.1 17.25 Q32 15 35.9 17.25 L42.83 21.25 Q46.72 23.5 46.72 28 L46.72 36 Q46.72 40.5 42.83 42.75 L35.9 46.75 Q32 49 28.1 46.75 L21.17 42.75 Q17.28 40.5 17.28 36 L17.28 28 Q17.28 23.5 21.17 21.25 Z"
        fill="#ffffff"
      />
    </svg>
  )
}
