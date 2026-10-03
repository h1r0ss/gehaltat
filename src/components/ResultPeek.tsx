// Phones only (see .result-peek in styles.css): the calculator form fills the
// first screen, so the live result sits below the fold while the visitor
// types. This bar shows the headline figure at the bottom of the screen until
// the result card itself scrolls into view, and jumps there on tap.
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context.tsx';

type ResultPeekProps = {
  /** The result card's id: the bar hides once its headline figure is on screen or above it. */
  targetId: string;
  /** Only after the visitor entered something; the untouched page needs no nudge. */
  active: boolean;
  text: string;
};

export function ResultPeek({ targetId, active, text }: ResultPeekProps) {
  const { t } = useI18n();
  const [resultBelow, setResultBelow] = useState(false);

  // Watch the headline figure itself (the card's top can be on screen while the median is not);
  // re-attach when the text changes, because the figure appears and disappears with the result.
  useEffect(() => {
    const card = document.getElementById(targetId);
    const target = card?.querySelector('.result-value') ?? card;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setResultBelow(!entry.isIntersecting && entry.boundingClientRect.top > 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId, text]);

  if (!active || !resultBelow) return null;
  return (
    <div className="result-peek">
      <p className="result-peek-text">{text}</p>
      <a className="btn btn-small result-peek-link" href={`#${targetId}`}>
        {t('peek.show')}
      </a>
    </div>
  );
}
