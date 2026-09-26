import { redirect } from 'next/navigation';

/** The app's only surface is the OS at /farm; the root goes there. */
export default function Home() {
  redirect('/farm');
}
