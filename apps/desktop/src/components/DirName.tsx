import { cn } from '@angkorgit/design-system';
import { dirname } from '@/shared/utils';

export function DirName({ path, className }: { path: string; className?: string }) {
  const dir = dirname(path);
  if (!dir) return null;
  return (
    <span dir="rtl" className={cn('min-w-0 flex-1 truncate text-left text-faint', className)}>
      <bdi>{dir}</bdi>
    </span>
  );
}
