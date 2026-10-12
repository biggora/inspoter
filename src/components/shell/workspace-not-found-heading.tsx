"use client";

import { useEffect, useRef } from "react";

// The 404 page has no shell and no autofocus target, so the heading takes
// focus on render (AC-WS-013): a keyboard or screen-reader user lands on the
// message instead of at the top of an unlabelled page.
export function WorkspaceNotFoundHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className="mt-2 font-heading text-3xl font-bold focus:outline-none"
    >
      {children}
    </h1>
  );
}
