'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const Slider = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label?: string }
>(({ className, ...props }, ref) => (
  <input
    type="range"
    ref={ref}
    className={cn(
      'w-full h-1.5 rounded-full appearance-none cursor-pointer bg-input-border accent-accent',
      className
    )}
    {...props}
  />
));
Slider.displayName = 'Slider';

export { Slider };
