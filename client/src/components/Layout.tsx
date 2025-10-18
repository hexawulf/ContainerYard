import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import { ApiStatusBanner } from './ApiStatusBanner';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col min-h-screen">
      <ApiStatusBanner />
      <Navbar />
      <main className="flex-grow">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;