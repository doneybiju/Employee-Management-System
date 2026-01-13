// frontend/src/components/ui/input.tsx
import * as React from 'react';
import { forwardRef, InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
    return (
    <input
        ref={ref}
        {...props}
        className={
            "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" +
            (props.className ? ` ${props.className}` : "")
        }
    />
    );
});

Input.displayName = "Input";
