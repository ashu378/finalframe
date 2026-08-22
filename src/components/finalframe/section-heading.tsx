export function SectionHeading({ eyebrow, title, description, align = 'left' }: { eyebrow?: string; title: string; description?: string; align?: 'left' | 'center' }) {
  return (
    <div className={`${align === 'center' ? 'mx-auto text-center' : ''} max-w-2xl`}>
      {eyebrow && <p className="ff-eyebrow">{eyebrow}</p>}
      <h2 className="public-heading-section mt-4">{title}</h2>
      {description && <p className="public-body-text mt-6 max-w-xl">{description}</p>}
    </div>
  );
}
