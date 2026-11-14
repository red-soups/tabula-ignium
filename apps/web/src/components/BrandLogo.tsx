type BrandLogoProps = {
  className?: string
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 300 104"
      role="img"
      aria-label="산불24"
    >
      <defs>
        <mask id="brand-flame-cutout">
          <rect width="104" height="104" fill="white" />
          <path
            d="M52 19c10 14 8 29-4 42 13-5 22-14 27-26 10 13 12 29 4 42-6 10-16 17-29 19 20-13 27-29 22-45-3 8-9 15-18 19 8-18 6-35-2-51Z"
            fill="black"
          />
        </mask>
      </defs>

      <g transform="translate(2 1)">
        <path
          d="M51 3C27 15 10 37 8 61c-2 23 11 39 30 44 26 7 53-7 62-32 9-27-5-52-31-66 5 13 2 25-9 36 3-15-1-29-9-40Z"
          fill="#E9011D"
          mask="url(#brand-flame-cutout)"
        />
        <path
          d="M12 70 35 49l16 16 15-12 28 21C84 94 63 105 42 102 26 99 16 87 12 70Z"
          fill="#032E1E"
        />
      </g>

      <text
        x="112"
        y="72"
        fill="#343333"
        fontFamily="Pretendard, Apple SD Gothic Neo, sans-serif"
        fontSize="45"
        fontWeight="900"
        letterSpacing="-4"
      >
        산불
      </text>
      <text
        x="202"
        y="72"
        fill="#032E1E"
        fontFamily="Inter, sans-serif"
        fontSize="52"
        fontWeight="900"
        letterSpacing="-3"
      >
        24
      </text>
      <path d="M270 72h25M282.5 59.5v25" stroke="#E9011D" strokeWidth="7" />
    </svg>
  )
}
