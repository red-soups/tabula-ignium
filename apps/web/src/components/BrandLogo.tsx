type BrandLogoProps = {
  className?: string
}

export function BrandLogo({ className }: BrandLogoProps) {
  return <img className={className} src="/sanbul24-icon.png" alt="산불24" />
}
