import React, {useState, useRef, useEffect} from 'react';
import {MoreHorizontal} from 'lucide-react';

interface DropdownProps {
  trigger?: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
}

export default function Dropdown({
  trigger,
  children,
  align = 'right',
  width = 'w-48',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger || (
          <div className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-md transition-colors text-gray-500">
            <MoreHorizontal size={20} />
          </div>
        )}
      </div>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-2 ${width} origin-top-right rounded-lg bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 shadow-xl z-50 focus:outline-none py-1 animate-in fade-in zoom-in-95 duration-100`}
        >
          <div onClick={() => setIsOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
}
