// frontend/src/components/ui/button.tsx
import * as React from 'react';
import { forwardRef, ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
    return (
        <button
            ref={ref}
            {...props}
            className={
                "inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 " +
                (props.className ? ` ${props.className}` : "")
            }
        />
    );
});

Button.displayName = "Button";
