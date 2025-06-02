import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'HopeStream Vault',
  description: 'Secure donation vault with milestone-based release',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}