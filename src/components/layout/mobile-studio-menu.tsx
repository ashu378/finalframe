'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Plus, X } from 'lucide-react';
import { StudioNavigation } from './studio-navigation';
import { SignOutButton } from '@/components/auth/sign-out-button';

export function MobileStudioMenu() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const close = () => dialog.current?.close();
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  return <>
    <button ref={trigger} type="button" onClick={() => dialog.current?.showModal()} aria-label="Open studio menu" aria-haspopup="dialog" className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold"><Menu className="size-5" aria-hidden="true" /><span>Menu</span></button>
    <dialog ref={dialog} className="ff-menu-dialog" aria-labelledby="studio-menu-title" onClose={() => trigger.current?.focus()} onClick={(event) => { if (event.target === event.currentTarget && event.clientX < event.currentTarget.getBoundingClientRect().left) close(); }}>
      <div className="mb-8 flex items-center justify-between gap-4"><h2 id="studio-menu-title" className="ff-display text-xl font-semibold">Your studio</h2><button type="button" onClick={close} aria-label="Close studio menu" className="grid size-11 place-items-center rounded-xl hover:bg-secondary"><X className="size-5" aria-hidden="true" /></button></div>
      <Link href="/dashboard/create" onClick={close} className="ff-button-primary mb-6"><Plus className="size-4" aria-hidden="true" />Create a video</Link>
      <StudioNavigation onNavigate={close} />
      <div className="mt-auto border-t border-border pt-6"><SignOutButton /></div>
    </dialog>
  </>;
}
