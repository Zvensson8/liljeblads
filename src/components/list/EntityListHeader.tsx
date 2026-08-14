import type { ReactNode } from 'react';

export function EntityListHeader({
  icon,
  title,
  actions,
}: {
  icon?: ReactNode;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h1 className="text-lg md:text-xl font-semibold truncate">{title}</h1>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
